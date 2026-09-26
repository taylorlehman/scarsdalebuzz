/**
 * Runtime configuration for the Scarsdale Buzz MCP server.
 *
 * The server is exposed through Firebase Hosting rewrites on the same origin as
 * the website (e.g. https://scarsdalebuzz.com/mcp). Serving from the site's own
 * origin matters: the consent page signs users in with the Firebase Web SDK,
 * which only works on domains authorized for Firebase Auth.
 */

/** Public origin for each Firebase project, used when MCP_PUBLIC_URL is unset. */
const PROJECT_PUBLIC_URLS = {
  'scarsdale-buzz-prod': 'https://scarsdalebuzz.com',
  'scarsdale-buzz-staging': 'https://scarsdale-buzz-staging.web.app',
};

export const SCOPES = Object.freeze({
  DIRECTORY_READ: 'directory:read',
  SAVED_READ: 'saved:read',
});

export const SCOPE_DESCRIPTIONS = Object.freeze({
  [SCOPES.DIRECTORY_READ]: 'Search and browse the Scarsdale Buzz provider directory',
  [SCOPES.SAVED_READ]: 'See the providers you have saved to your Recommendations',
});

export const SUPPORTED_SCOPES = Object.freeze(Object.values(SCOPES));

/**
 * @param {object} options
 * @param {string} options.publicUrl - Public origin the site (and this server) is served from.
 * @param {string[]} [options.extraAllowedOrigins] - Additional browser origins allowed to call /mcp.
 * @param {boolean} [options.allowInsecureLocalhost] - Permit an http://localhost publicUrl (local dev/tests only).
 */
export function buildConfig({ publicUrl, extraAllowedOrigins = [], allowInsecureLocalhost = false }) {
  const url = new URL(publicUrl);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecureLocalhost && isLocal)) {
    throw new Error(`MCP public URL must use https: ${publicUrl}`);
  }
  const origin = url.origin;

  return Object.freeze({
    origin,
    // RFC 8414 issuer: no path, no trailing slash. Clients compare it byte-for-byte.
    issuer: origin,
    // RFC 8707 / RFC 9728 canonical resource identifier for this MCP server.
    resourceUrl: `${origin}/mcp`,
    authorizationEndpoint: `${origin}/oauth/authorize`,
    consentPath: '/oauth/consent',
    tokenEndpoint: `${origin}/oauth/token`,
    registrationEndpoint: `${origin}/oauth/register`,
    revocationEndpoint: `${origin}/oauth/revoke`,
    documentationUrl: `${origin}/`,
    allowedOrigins: [origin, ...extraAllowedOrigins.map((o) => new URL(o).origin)],
    isLocal,

    accessTokenTtlSeconds: 60 * 60,
    refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
    authorizationCodeTtlSeconds: 5 * 60,
    authorizationRequestTtlSeconds: 15 * 60,
  });
}

/** Resolves configuration from the Cloud Functions environment. */
export function configFromEnv(env = process.env) {
  let projectId = env.GCLOUD_PROJECT || env.GCP_PROJECT;
  if (!projectId && env.FIREBASE_CONFIG) {
    try {
      projectId = JSON.parse(env.FIREBASE_CONFIG).projectId;
    } catch {
      // ignore malformed FIREBASE_CONFIG
    }
  }
  const publicUrl = env.MCP_PUBLIC_URL || PROJECT_PUBLIC_URLS[projectId];
  if (!publicUrl) {
    throw new Error(`No public URL for project "${projectId}". Set MCP_PUBLIC_URL.`);
  }
  const extraAllowedOrigins = (env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return buildConfig({ publicUrl, extraAllowedOrigins });
}
