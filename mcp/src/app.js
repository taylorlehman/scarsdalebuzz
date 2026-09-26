import express from 'express';
import cors from 'cors';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
  originValidation,
  requireBearerAuth,
} from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { SUPPORTED_SCOPES } from './config.js';
import { OAuthService } from './oauth/service.js';
import { createOAuthRouter } from './oauth/router.js';
import { createCimdResolver } from './oauth/cimd.js';
import { DirectoryService } from './directory/directory.js';
import { createMcpServer } from './mcpServer.js';
import { rateLimit } from './rateLimit.js';

/**
 * Builds the HTTP app serving:
 *   /mcp                                          MCP endpoint (Streamable HTTP; OAuth-protected)
 *   /.well-known/oauth-protected-resource[/mcp]   RFC 9728 Protected Resource Metadata
 *   /.well-known/oauth-authorization-server       RFC 8414 Authorization Server Metadata
 *   /oauth/*                                      authorization server (see oauth/router.js)
 *
 * @param {object} deps
 * @param {ReturnType<import('./config.js').buildConfig>} deps.config
 * @param {object} deps.oauthStore - FirestoreOAuthStore or MemoryOAuthStore
 * @param {object} deps.identity - FirebaseIdentity (or a test double)
 * @param {object} deps.directorySource - FirestoreDirectorySource or MemoryDirectorySource
 * @param {(clientId: string) => Promise<object>} [deps.resolveUrlClient]
 * @param {boolean} [deps.devSignIn] - local development only
 * @param {(err: Error) => void} [deps.onError]
 */
export function createApp({
  config,
  oauthStore,
  identity,
  directorySource,
  resolveUrlClient = createCimdResolver(),
  devSignIn = false,
  onError = (err) => console.error(err),
}) {
  const oauth = new OAuthService({ config, store: oauthStore, identity, resolveUrlClient });
  const directory = new DirectoryService(directorySource, { origin: config.origin });

  const app = express();
  app.disable('x-powered-by');
  // Behind Firebase Hosting / Cloud Run; needed for per-IP rate limits.
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    // Nothing here is cacheable by intermediaries (Firebase Hosting caches
    // function responses that don't opt out).
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  // --- Discovery --------------------------------------------------------------
  const resourceServerUrl = new URL(config.resourceUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
  const metadataOptions = {
    oauthMetadata: oauth.authorizationServerMetadata(),
    resourceServerUrl,
    scopesSupported: [...SUPPORTED_SCOPES],
    resourceName: 'Scarsdale Buzz',
    serviceDocumentationUrl: new URL(config.documentationUrl),
    dangerouslyAllowInsecureIssuerUrl: config.isLocal,
  };
  // Serves /.well-known/oauth-protected-resource/mcp and /.well-known/oauth-authorization-server.
  app.use(mcpAuthMetadataRouter(metadataOptions));
  // Root-level fallback that clients probe when the path-specific document is absent.
  app.get('/.well-known/oauth-protected-resource', cors(), (req, res) => {
    res.json({
      resource: config.resourceUrl,
      authorization_servers: [config.issuer],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ['header'],
      resource_name: 'Scarsdale Buzz',
      resource_documentation: config.documentationUrl,
    });
  });

  // --- Authorization server ------------------------------------------------------
  app.use('/oauth', createOAuthRouter({ oauth, config, devSignIn, onError }));

  // --- MCP endpoint -------------------------------------------------------------
  const mcpHandler = createMcpHandler(() => createMcpServer({ directory, onError }), {
    onerror: onError,
    // One JSON body per request: nothing here streams, and Firebase Hosting
    // rewrites buffer responses anyway.
    responseMode: 'json',
    maxRequestBodySize: 256 * 1024,
  });
  const nodeHandler = toNodeHandler(mcpHandler, { onerror: onError, maxRequestBodySize: 256 * 1024 });

  const allowedOriginHosts = config.allowedOrigins.map((o) => new URL(o).hostname);
  app.use(
    '/mcp',
    // Browser-originated requests must come from an allowed origin (DNS
    // rebinding / CSRF defense). Native and server-side clients send no Origin.
    originValidation(config.isLocal ? [...allowedOriginHosts, 'localhost', '127.0.0.1', '[::1]'] : allowedOriginHosts),
    cors({
      origin: config.allowedOrigins,
      exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
      maxAge: 600,
    }),
    requireBearerAuth({ verifier: oauth, resourceMetadataUrl }),
    rateLimit({ windowMs: 60_000, max: 120, key: (req) => req.auth?.extra?.uid }),
    express.json({ limit: '256kb' }),
    (req, res) => nodeHandler(req, res, req.body),
  );

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'request_too_large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_request' });
    onError(err);
    return res.status(500).json({ error: 'server_error' });
  });

  return app;
}
