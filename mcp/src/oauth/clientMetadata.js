/**
 * Validation shared by Dynamic Client Registration (RFC 7591) and Client ID
 * Metadata Documents. Returns a normalized client record or throws
 * {@link ClientMetadataError}.
 */

import { SUPPORTED_SCOPES } from '../config.js';

export class ClientMetadataError extends Error {
  constructor(error, description) {
    super(description);
    this.error = error;
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2048;
const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];

export function isLoopbackRedirect(uri) {
  const url = new URL(uri);
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * MCP requires every redirect URI to be https or a loopback http URL.
 * @returns {string|null} an error description, or null when valid.
 */
export function redirectUriProblem(uri) {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > MAX_URI_LENGTH) {
    return 'redirect_uri must be a non-empty string';
  }
  let url;
  try {
    url = new URL(uri);
  } catch {
    return `redirect_uri is not an absolute URL: ${uri}`;
  }
  if (url.hash) return 'redirect_uri must not contain a fragment';
  if (url.username || url.password) return 'redirect_uri must not contain credentials';
  if (url.protocol === 'https:') return null;
  if (isLoopbackRedirect(uri)) return null;
  return `redirect_uri must use https, or http on localhost: ${uri}`;
}

/**
 * Exact-match comparison, except that loopback redirect URIs may use any port
 * (RFC 8252 §7.3; OAuth 2.1 §8.4.2) because native apps bind ephemeral ports.
 */
export function redirectUriMatches(registered, presented) {
  if (registered === presented) return true;
  try {
    const a = new URL(registered);
    const b = new URL(presented);
    if (!isLoopbackRedirect(registered) || !isLoopbackRedirect(presented)) return false;
    return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

function optionalString(meta, field, max = 200) {
  const value = meta[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > max) {
    throw new ClientMetadataError('invalid_client_metadata', `${field} must be a string of at most ${max} characters`);
  }
  return value;
}

function optionalHttpsUrl(meta, field) {
  const value = optionalString(meta, field, MAX_URI_LENGTH);
  if (value === undefined) return undefined;
  try {
    if (new URL(value).protocol === 'https:') return value;
  } catch {
    // fall through
  }
  throw new ClientMetadataError('invalid_client_metadata', `${field} must be an https URL`);
}

/**
 * @param {object} meta - Raw client metadata.
 * @param {object} options
 * @param {string[]} options.allowedAuthMethods
 * @param {string} options.defaultAuthMethod
 */
export function validateClientMetadata(meta, { allowedAuthMethods, defaultAuthMethod }) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new ClientMetadataError('invalid_client_metadata', 'Client metadata must be a JSON object');
  }

  const redirectUris = meta.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    throw new ClientMetadataError('invalid_redirect_uri', `redirect_uris must list 1-${MAX_REDIRECT_URIS} URIs`);
  }
  for (const uri of redirectUris) {
    const problem = redirectUriProblem(uri);
    if (problem) throw new ClientMetadataError('invalid_redirect_uri', problem);
  }

  const authMethod = meta.token_endpoint_auth_method ?? defaultAuthMethod;
  if (!allowedAuthMethods.includes(authMethod)) {
    throw new ClientMetadataError(
      'invalid_client_metadata',
      `token_endpoint_auth_method must be one of: ${allowedAuthMethods.join(', ')}`,
    );
  }

  // Clients may list grant types we don't support (Claude's metadata document
  // adds jwt-bearer, for example). RFC 7591 §2 lets the server ignore those, so
  // keep only the ones we support; the token endpoint enforces the rest.
  const requestedGrants = meta.grant_types ?? ['authorization_code'];
  if (!Array.isArray(requestedGrants) || !requestedGrants.includes('authorization_code')) {
    throw new ClientMetadataError('invalid_client_metadata', 'grant_types must include authorization_code');
  }
  const grantTypes = SUPPORTED_GRANT_TYPES.filter((g) => requestedGrants.includes(g));

  const responseTypes = meta.response_types ?? ['code'];
  if (!Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== 'code') {
    throw new ClientMetadataError('invalid_client_metadata', 'response_types must be ["code"]');
  }

  const scope = optionalString(meta, 'scope', 500);
  if (scope && scope.split(' ').some((s) => s && !SUPPORTED_SCOPES.includes(s))) {
    throw new ClientMetadataError('invalid_client_metadata', `scope may only contain: ${SUPPORTED_SCOPES.join(' ')}`);
  }

  const applicationType = meta.application_type;
  if (applicationType !== undefined && applicationType !== 'web' && applicationType !== 'native') {
    throw new ClientMetadataError('invalid_client_metadata', 'application_type must be "web" or "native"');
  }

  return {
    redirect_uris: [...redirectUris],
    token_endpoint_auth_method: authMethod,
    grant_types: [...grantTypes],
    response_types: ['code'],
    client_name: optionalString(meta, 'client_name', 100),
    client_uri: optionalHttpsUrl(meta, 'client_uri'),
    logo_uri: optionalHttpsUrl(meta, 'logo_uri'),
    scope,
    application_type: applicationType,
    software_id: optionalString(meta, 'software_id'),
    software_version: optionalString(meta, 'software_version'),
  };
}

/** Removes undefined fields so records serialize cleanly to Firestore/JSON. */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
