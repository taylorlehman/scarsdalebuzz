import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { AuthorizeError, OAuthHttpError } from './service.js';
import { contentSecurityPolicy, renderConsentPage, renderErrorPage } from './pages.js';
import { rateLimit } from '../rateLimit.js';

/**
 * Express router for the authorization server, mounted at /oauth.
 *
 *   GET  /oauth/authorize  validate the request, then redirect to the consent page
 *   GET  /oauth/consent    sign-in + consent UI
 *   POST /oauth/consent    { request, idToken, decision: check|approve|deny }
 *   POST /oauth/token      authorization_code and refresh_token grants
 *   POST /oauth/register   RFC 7591 dynamic client registration
 *   POST /oauth/revoke     RFC 7009 token revocation
 *
 * @param {object} deps
 * @param {import('./service.js').OAuthService} deps.oauth
 * @param {ReturnType<import('../config.js').buildConfig>} deps.config
 * @param {boolean} [deps.devSignIn]
 * @param {(err: Error) => void} [deps.onError]
 */
export function createOAuthRouter({ oauth, config, devSignIn = false, onError = () => {} }) {
  const router = express.Router();
  const formOrJson = [express.urlencoded({ extended: false, limit: '16kb' }), express.json({ limit: '16kb' })];

  // Machine endpoints are called cross-origin by browser-based MCP clients.
  // They carry no ambient credentials (no cookies), so wildcard CORS is safe.
  const machineCors = cors({ origin: '*', methods: ['POST', 'OPTIONS'], maxAge: 600 });

  function sendHtml(res, status, render) {
    const nonce = crypto.randomBytes(16).toString('base64');
    res
      .status(status)
      .set('Content-Security-Policy', contentSecurityPolicy(nonce))
      .set('X-Frame-Options', 'DENY')
      .type('html')
      .send(render(nonce));
  }

  function sendOAuthError(res, err) {
    if (err instanceof OAuthHttpError) {
      if (err.status === 401 && err.error === 'invalid_client') res.set('WWW-Authenticate', 'Basic realm="oauth"');
      return res.status(err.status).json(err.toJSON());
    }
    onError(err);
    return res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }

  // --- Authorization endpoint -------------------------------------------------

  router.get('/authorize', rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.ip }), async (req, res) => {
    try {
      const params = Object.fromEntries(
        Object.entries(req.query).filter(([, v]) => typeof v === 'string'),
      );
      const { requestId } = await oauth.startAuthorization(params);
      res.redirect(303, `${config.consentPath}?request=${encodeURIComponent(requestId)}`);
    } catch (err) {
      if (!(err instanceof AuthorizeError)) {
        onError(err);
        return sendHtml(res, 500, (nonce) =>
          renderErrorPage({ title: 'Something went wrong', message: 'Please try again in a moment.', nonce }),
        );
      }
      if (err.redirectUri) {
        return res.redirect(
          303,
          oauth.buildRedirect(err.redirectUri, { error: err.error, error_description: err.message, state: err.state }),
        );
      }
      return sendHtml(res, 400, (nonce) =>
        renderErrorPage({ title: 'This connection request is invalid', message: err.message, nonce }),
      );
    }
  });

  router.get('/consent', async (req, res) => {
    const requestId = typeof req.query.request === 'string' ? req.query.request : '';
    const request = await oauth.getPendingRequest(requestId).catch((err) => {
      onError(err);
      return null;
    });
    if (!request) {
      return sendHtml(res, 400, (nonce) =>
        renderErrorPage({
          title: 'This link has expired',
          message: 'Connection requests are only valid for a few minutes.',
          nonce,
        }),
      );
    }
    return sendHtml(res, 200, (nonce) => renderConsentPage({ request, requestId, nonce, devSignIn }));
  });

  router.post(
    '/consent',
    rateLimit({ windowMs: 60_000, max: 30, key: (req) => req.ip }),
    express.json({ limit: '16kb' }),
    async (req, res) => {
      // CSRF defense: only our own consent page may submit decisions.
      if (req.get('origin') !== config.origin) {
        return res.status(403).json({ error: 'invalid_request', error_description: 'Cross-origin request rejected' });
      }
      const { request: requestId, idToken, decision } = req.body || {};
      try {
        if (typeof requestId !== 'string' || !(await oauth.getPendingRequest(requestId))) {
          throw new OAuthHttpError(400, 'invalid_request', 'This authorization request has expired. Please try connecting again.');
        }
        if (decision === 'check') {
          const user = await oauth.describeUser(idToken);
          return res.json({ name: user.name, email: user.email, approved: user.approved });
        }
        if (decision !== 'approve' && decision !== 'deny') {
          throw new OAuthHttpError(400, 'invalid_request', 'Unknown decision');
        }
        const redirectTo = await oauth.completeAuthorization({ requestId, idToken, approve: decision === 'approve' });
        return res.json({ redirect_to: redirectTo });
      } catch (err) {
        return sendOAuthError(res, err);
      }
    },
  );

  // --- Token endpoint -----------------------------------------------------------

  /** Client credentials from HTTP Basic (client_secret_basic) or the body. */
  function clientCredentials(req) {
    const header = req.get('authorization');
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep > 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, sep)),
          clientSecret: decodeURIComponent(decoded.slice(sep + 1)),
        };
      }
    }
    return { clientId: req.body?.client_id, clientSecret: req.body?.client_secret };
  }

  router.options(['/token', '/register', '/revoke'], machineCors);

  router.post(
    '/token',
    machineCors,
    rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.ip }),
    ...formOrJson,
    async (req, res) => {
      res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache');
      try {
        const body = req.body || {};
        if (body.grant_type !== 'authorization_code' && body.grant_type !== 'refresh_token') {
          throw new OAuthHttpError(400, 'unsupported_grant_type', 'Unsupported grant_type');
        }
        const client = await oauth.authenticateClient(clientCredentials(req));
        if (!client.grant_types.includes(body.grant_type)) {
          throw new OAuthHttpError(400, 'unauthorized_client', `This client may not use grant_type ${body.grant_type}`);
        }
        const tokens =
          body.grant_type === 'authorization_code'
            ? await oauth.exchangeAuthorizationCode(client, body)
            : await oauth.exchangeRefreshToken(client, body);
        res.json(tokens);
      } catch (err) {
        sendOAuthError(res, err);
      }
    },
  );

  router.post(
    '/register',
    machineCors,
    rateLimit({ windowMs: 60 * 60_000, max: 20, key: (req) => req.ip }),
    express.json({ limit: '16kb' }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        res.status(201).json(await oauth.registerClient(req.body));
      } catch (err) {
        sendOAuthError(res, err);
      }
    },
  );

  router.post(
    '/revoke',
    machineCors,
    rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.ip }),
    ...formOrJson,
    async (req, res) => {
      try {
        const client = await oauth.authenticateClient(clientCredentials(req));
        await oauth.revoke(client, req.body || {});
        res.status(200).end();
      } catch (err) {
        sendOAuthError(res, err);
      }
    },
  );

  return router;
}
