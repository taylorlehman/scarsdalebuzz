/**
 * OAuth 2.1 authorization server for the MCP endpoint.
 *
 * Users authenticate with the same Firebase Auth identity they use on the
 * website (Facebook/Google via the Firebase Web SDK on the consent page). The
 * consent page posts the resulting Firebase ID token here; we verify it and
 * mint our own short-lived, audience-bound access tokens. Firebase ID tokens
 * are never accepted at /mcp and never handed to MCP clients.
 */

import crypto from 'node:crypto';
import { OAuthError, OAuthErrorCode, checkResourceAllowed } from '@modelcontextprotocol/server';
import { SUPPORTED_SCOPES } from '../config.js';
import { randomToken, sha256, safeEqual, isValidCodeChallenge, verifyPkce } from './crypto.js';
import {
  ClientMetadataError,
  compact,
  redirectUriMatches,
  validateClientMetadata,
} from './clientMetadata.js';
import { isUrlClientId } from './cimd.js';

const TOKEN_PREFIX = { access: 'sbz_at_', refresh: 'sbz_rt_', code: 'sbz_ac_', secret: 'sbz_cs_' };

/** An error answered as an RFC 6749 JSON error body. */
export class OAuthHttpError extends Error {
  constructor(status, error, description) {
    super(description);
    this.status = status;
    this.error = error;
  }

  toJSON() {
    return compact({ error: this.error, error_description: this.message });
  }
}

/**
 * An /authorize failure. When `redirectUri` is set the error is reported to the
 * client via redirect; otherwise the redirect URI could not be trusted and the
 * error is shown to the user instead (RFC 6749 §4.1.2.1).
 */
export class AuthorizeError extends Error {
  constructor(error, description, { redirectUri, state } = {}) {
    super(description);
    this.error = error;
    this.redirectUri = redirectUri;
    this.state = state;
  }
}

function parseScopes(scope) {
  return [...new Set(String(scope || '').split(' ').filter(Boolean))];
}

export class OAuthService {
  /**
   * @param {object} deps
   * @param {ReturnType<import('../config.js').buildConfig>} deps.config
   * @param {import('./store.js').FirestoreOAuthStore} deps.store
   * @param {import('../identity.js').FirebaseIdentity} deps.identity
   * @param {(clientId: string) => Promise<object>} deps.resolveUrlClient - CIMD resolver
   * @param {() => number} [deps.now]
   */
  constructor({ config, store, identity, resolveUrlClient, now = Date.now }) {
    this.config = config;
    this.store = store;
    this.identity = identity;
    this.resolveUrlClient = resolveUrlClient;
    this.now = now;
  }

  expiresIn(seconds) {
    return new Date(this.now() + seconds * 1000);
  }

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  /** RFC 8414 Authorization Server Metadata. */
  authorizationServerMetadata() {
    const { config } = this;
    const authMethods = ['none', 'client_secret_post', 'client_secret_basic'];
    return {
      issuer: config.issuer,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      registration_endpoint: config.registrationEndpoint,
      revocation_endpoint: config.revocationEndpoint,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: authMethods,
      revocation_endpoint_auth_methods_supported: authMethods,
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      service_documentation: config.documentationUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------------

  /** Looks up a registered client, or fetches its Client ID Metadata Document. */
  async getClient(clientId) {
    if (typeof clientId !== 'string' || !clientId || clientId.length > 2048) return null;
    if (isUrlClientId(clientId)) return this.resolveUrlClient(clientId);
    return this.store.getClient(clientId);
  }

  /** RFC 7591 Dynamic Client Registration (kept for clients without CIMD support). */
  async registerClient(metadata) {
    let normalized;
    try {
      normalized = validateClientMetadata(metadata, {
        allowedAuthMethods: ['none', 'client_secret_post', 'client_secret_basic'],
        defaultAuthMethod: 'client_secret_basic',
      });
    } catch (err) {
      if (err instanceof ClientMetadataError) throw new OAuthHttpError(400, err.error, err.message);
      throw err;
    }

    const issuedAt = Math.floor(this.now() / 1000);
    const client = compact({
      ...normalized,
      client_id: `sbz_client_${crypto.randomUUID()}`,
      client_id_issued_at: issuedAt,
      source: 'dynamic_registration',
    });

    let clientSecret;
    if (client.token_endpoint_auth_method !== 'none') {
      clientSecret = randomToken(TOKEN_PREFIX.secret);
      client.client_secret_hash = sha256(clientSecret);
    }
    await this.store.createClient(client);

    const { client_secret_hash: _omit, source: _source, ...response } = client;
    if (clientSecret) {
      response.client_secret = clientSecret;
      response.client_secret_expires_at = 0;
    }
    return response;
  }

  /**
   * Authenticates a client at the token/revocation endpoints.
   * @param {{ clientId?: string, clientSecret?: string }} credentials
   */
  async authenticateClient({ clientId, clientSecret }) {
    const invalid = (msg) => new OAuthHttpError(401, 'invalid_client', msg);
    if (!clientId) throw invalid('Client authentication failed: missing client_id');

    let client;
    try {
      client = await this.getClient(clientId);
    } catch (err) {
      throw invalid(err.message);
    }
    if (!client) throw invalid('Unknown client');

    if (client.token_endpoint_auth_method === 'none') return client;
    if (!clientSecret || !client.client_secret_hash || !safeEqual(sha256(clientSecret), client.client_secret_hash)) {
      throw invalid('Client authentication failed');
    }
    return client;
  }

  // ---------------------------------------------------------------------------
  // Authorization endpoint
  // ---------------------------------------------------------------------------

  /**
   * Validates an /authorize request and records it until the user decides.
   * @returns {Promise<{ requestId: string }>}
   */
  async startAuthorization(params) {
    const clientId = params.client_id;
    if (!clientId) throw new AuthorizeError('invalid_request', 'Missing client_id.');

    let client;
    try {
      client = await this.getClient(clientId);
    } catch (err) {
      throw new AuthorizeError('invalid_client', err.message);
    }
    if (!client) throw new AuthorizeError('invalid_client', 'This application is not registered.');

    // Establish a trusted redirect URI before reporting anything via redirect.
    let redirectUri = params.redirect_uri;
    const redirectUriProvided = !!redirectUri;
    if (redirectUriProvided) {
      if (!client.redirect_uris.some((registered) => redirectUriMatches(registered, redirectUri))) {
        throw new AuthorizeError('invalid_request', 'The redirect_uri is not registered for this application.');
      }
    } else if (client.redirect_uris.length === 1) {
      redirectUri = client.redirect_uris[0];
    } else {
      throw new AuthorizeError('invalid_request', 'Missing redirect_uri.');
    }

    const state = params.state;
    const fail = (error, description) => new AuthorizeError(error, description, { redirectUri, state });

    if (params.response_type !== 'code') {
      throw fail('unsupported_response_type', 'Only response_type=code is supported.');
    }
    if (params.code_challenge_method !== 'S256' || !isValidCodeChallenge(params.code_challenge)) {
      throw fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
    }

    const allowedForClient = client.scope ? parseScopes(client.scope) : SUPPORTED_SCOPES;
    let scopes = parseScopes(params.scope);
    if (scopes.some((s) => !SUPPORTED_SCOPES.includes(s) || !allowedForClient.includes(s))) {
      throw fail('invalid_scope', `Supported scopes: ${allowedForClient.join(' ')}`);
    }
    if (scopes.length === 0) scopes = [...allowedForClient];

    if (params.resource !== undefined && !this.isOurResource(params.resource)) {
      throw fail('invalid_target', `This server only issues tokens for ${this.config.resourceUrl}`);
    }

    const requestId = randomToken();
    await this.store.putRequest(
      requestId,
      compact({
        clientId: client.client_id,
        clientName: client.client_name,
        clientUri: client.client_uri,
        clientSource: client.source,
        redirectUri,
        redirectUriProvided,
        state,
        scopes,
        codeChallenge: params.code_challenge,
        resource: this.config.resourceUrl,
        expireAt: this.expiresIn(this.config.authorizationRequestTtlSeconds),
      }),
    );
    return { requestId };
  }

  /** Details the consent page shows the user. */
  async getPendingRequest(requestId) {
    if (typeof requestId !== 'string' || !requestId) return null;
    return this.store.getRequest(requestId);
  }

  /** Checks who the Firebase ID token belongs to and whether they may connect. */
  async describeUser(idToken) {
    const user = await this.verifyIdToken(idToken);
    const membership = await this.identity.getMembership(user.uid);
    return { ...user, approved: membership.approved };
  }

  /**
   * Records the user's decision and returns the client redirect URL.
   * @param {{ requestId: string, idToken?: string, approve: boolean }} input
   */
  async completeAuthorization({ requestId, idToken, approve }) {
    // Authenticate before consuming the request so a stale sign-in can retry.
    const user = approve ? await this.verifyIdToken(idToken) : null;

    const request = await this.store.takeRequest(requestId);
    if (!request) {
      throw new OAuthHttpError(400, 'invalid_request', 'This authorization request has expired. Please try connecting again.');
    }

    if (!approve) {
      return this.buildRedirect(request.redirectUri, {
        error: 'access_denied',
        error_description: 'The user denied access.',
        state: request.state,
      });
    }

    const membership = await this.identity.getMembership(user.uid);
    if (!membership.approved) {
      return this.buildRedirect(request.redirectUri, {
        error: 'access_denied',
        error_description: 'This Scarsdale Buzz account has not been approved for directory access yet.',
        state: request.state,
      });
    }

    const code = randomToken(TOKEN_PREFIX.code);
    await this.store.putCode(sha256(code), {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      redirectUriProvided: request.redirectUriProvided,
      codeChallenge: request.codeChallenge,
      scopes: request.scopes,
      resource: request.resource,
      uid: user.uid,
      grantId: crypto.randomUUID(),
      expireAt: this.expiresIn(this.config.authorizationCodeTtlSeconds),
    });

    return this.buildRedirect(request.redirectUri, { code, state: request.state });
  }

  buildRedirect(redirectUri, params) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries({ ...params, iss: this.config.issuer })) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    }
    return url.href;
  }

  async verifyIdToken(idToken) {
    if (typeof idToken !== 'string' || !idToken) {
      throw new OAuthHttpError(401, 'login_required', 'Please sign in to continue.');
    }
    try {
      return await this.identity.verifyIdToken(idToken);
    } catch {
      throw new OAuthHttpError(401, 'login_required', 'Your sign-in has expired. Please sign in again.');
    }
  }

  isOurResource(resource) {
    try {
      const url = new URL(resource);
      if (url.hash) return false;
      return checkResourceAllowed({ requestedResource: url, configuredResource: this.config.resourceUrl });
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Token endpoint
  // ---------------------------------------------------------------------------

  async exchangeAuthorizationCode(client, { code, code_verifier, redirect_uri, resource }) {
    if (!code || !code_verifier) {
      throw new OAuthHttpError(400, 'invalid_request', 'code and code_verifier are required');
    }
    const invalidGrant = (msg) => new OAuthHttpError(400, 'invalid_grant', msg);

    const consumed = await this.store.consumeCode(sha256(code));
    if (!consumed) throw invalidGrant('Authorization code is invalid or expired');
    const { record, reused } = consumed;
    if (reused) {
      // A replayed code suggests interception: revoke everything minted from it.
      await this.store.revokeGrant(record.grantId);
      throw invalidGrant('Authorization code has already been used');
    }
    if (record.clientId !== client.client_id) throw invalidGrant('Authorization code was issued to another client');
    if (record.redirectUriProvided && !redirect_uri) throw invalidGrant('redirect_uri is required');
    if (redirect_uri && redirect_uri !== record.redirectUri) throw invalidGrant('redirect_uri does not match');
    if (!verifyPkce(code_verifier, record.codeChallenge)) throw invalidGrant('PKCE verification failed');
    if (resource !== undefined && !this.isOurResource(resource)) {
      throw new OAuthHttpError(400, 'invalid_target', `Tokens can only be issued for ${this.config.resourceUrl}`);
    }

    return this.issueTokens(client, record);
  }

  async exchangeRefreshToken(client, { refresh_token, scope, resource }) {
    if (!refresh_token) throw new OAuthHttpError(400, 'invalid_request', 'refresh_token is required');
    const invalidGrant = (msg) => new OAuthHttpError(400, 'invalid_grant', msg);

    const hash = sha256(refresh_token);
    const existing = await this.store.getToken(hash);
    if (!existing || existing.type !== 'refresh') throw invalidGrant('Refresh token is invalid or expired');

    const consumed = await this.store.consumeRefreshToken(hash);
    if (!consumed) throw invalidGrant('Refresh token is invalid or expired');
    const { record, reused } = consumed;
    if (reused) {
      // Rotation replay (OAuth 2.1 §4.3.1): assume theft and end the whole grant.
      await this.store.revokeGrant(record.grantId);
      throw invalidGrant('Refresh token has already been used');
    }
    if (record.clientId !== client.client_id) throw invalidGrant('Refresh token was issued to another client');
    if (resource !== undefined && !this.isOurResource(resource)) {
      throw new OAuthHttpError(400, 'invalid_target', `Tokens can only be issued for ${this.config.resourceUrl}`);
    }

    let scopes = record.scopes;
    if (scope) {
      const requested = parseScopes(scope);
      if (requested.some((s) => !record.scopes.includes(s))) {
        throw new OAuthHttpError(400, 'invalid_scope', 'Requested scope exceeds the original grant');
      }
      scopes = requested;
    }

    const [active, membership] = await Promise.all([
      this.identity.isAccountActive(record.uid),
      this.identity.getMembership(record.uid),
    ]);
    if (!active || !membership.approved) {
      await this.store.revokeGrant(record.grantId);
      throw invalidGrant('This account no longer has directory access');
    }

    return this.issueTokens(client, { ...record, scopes });
  }

  async issueTokens(client, { uid, scopes, resource, grantId }) {
    const accessToken = randomToken(TOKEN_PREFIX.access);
    const base = { uid, clientId: client.client_id, scopes, resource, grantId };

    await this.store.putToken(sha256(accessToken), {
      ...base,
      type: 'access',
      expireAt: this.expiresIn(this.config.accessTokenTtlSeconds),
    });

    const response = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.config.accessTokenTtlSeconds,
      scope: scopes.join(' '),
    };

    if (client.grant_types?.includes('refresh_token')) {
      const refreshToken = randomToken(TOKEN_PREFIX.refresh);
      await this.store.putToken(sha256(refreshToken), {
        ...base,
        type: 'refresh',
        expireAt: this.expiresIn(this.config.refreshTokenTtlSeconds),
      });
      response.refresh_token = refreshToken;
    }
    return response;
  }

  /** RFC 7009. Unknown tokens are not an error. */
  async revoke(client, { token }) {
    if (!token) throw new OAuthHttpError(400, 'invalid_request', 'token is required');
    const hash = sha256(token);
    const record = await this.store.getToken(hash);
    if (!record || record.clientId !== client.client_id) return;
    if (record.type === 'refresh') await this.store.revokeGrant(record.grantId);
    else await this.store.deleteToken(hash);
  }

  // ---------------------------------------------------------------------------
  // Resource server
  // ---------------------------------------------------------------------------

  /**
   * OAuthTokenVerifier for requireBearerAuth. Only our own access tokens, bound
   * to this server's resource URL, are accepted.
   * @returns {Promise<import('@modelcontextprotocol/server').AuthInfo>}
   */
  async verifyAccessToken(token) {
    const invalid = (msg) => new OAuthError(OAuthErrorCode.InvalidToken, msg);
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX.access)) throw invalid('Invalid access token');

    const record = await this.store.getToken(sha256(token));
    if (!record || record.type !== 'access') throw invalid('Invalid or expired access token');
    if (record.resource !== this.config.resourceUrl) throw invalid('Access token was not issued for this server');

    const membership = await this.identity.getMembership(record.uid);
    if (!membership.approved) throw invalid('This account does not have directory access');

    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: Math.floor(new Date(record.expireAt).getTime() / 1000),
      resource: new URL(record.resource),
      extra: { uid: record.uid },
    };
  }
}
