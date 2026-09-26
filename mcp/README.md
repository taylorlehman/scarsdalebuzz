# Scarsdale Buzz MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants (Claude, ChatGPT, Cursor, VS Code, etc.) search the Scarsdale Buzz provider directory on behalf of a signed-in member.

- **Endpoint:** `https://scarsdalebuzz.com/mcp` (staging: `https://scarsdale-buzz-staging.web.app/mcp`)
- **Transport:** Streamable HTTP, stateless. Serves the 2026-07-28 protocol and falls back to 2025-era clients automatically.
- **Auth:** OAuth 2.1. Members sign in with the same Facebook login as the website, and only accounts approved for the directory can connect.
- **SDK:** `@modelcontextprotocol/server` v2 + `@modelcontextprotocol/express`

## Tools

All tools are read-only (`readOnlyHint: true`). Each returns `structuredContent` that matches its `outputSchema`, plus the same JSON as text for older clients.

| Tool | Scope | What it does |
| --- | --- | --- |
| `search_providers` | `directory:read` | Find providers by business or person name (partial names and typos OK) and return their details |
| `get_provider` | `directory:read` | Full details for one provider id |
| `list_providers_in_category` | `directory:read` | Every provider in a category, most-recommended first, paginated with `cursor` |
| `list_categories` | `directory:read` | All categories with their group and provider count; optional `group` filter |
| `list_category_groups` | `directory:read` | Category groups and their categories, plus ungrouped categories |
| `list_saved_providers` | `saved:read` | The member's saved providers ("My Recommendations"), newest first |

Provider records include name, business/contact name, phone, email, categories, recommendation count, last-recommended time, Sunny status and a link to the directory. Test providers (`isTestProvider`) are hidden, and other members' identities (`recentRecommenders`) are never exposed.

## How authorization works

```
MCP client ──(1) POST /mcp, no token──▶ 401 + WWW-Authenticate: resource_metadata=…
           ──(2) GET /.well-known/oauth-protected-resource/mcp ─▶ { authorization_servers: [https://scarsdalebuzz.com] }
           ──(3) GET /.well-known/oauth-authorization-server ───▶ endpoints, PKCE S256, CIMD, DCR
           ──(4) client_id = its metadata URL (CIMD), or POST /oauth/register (DCR)
Browser    ──(5) GET /oauth/authorize ─▶ 303 /oauth/consent  (sign in with Firebase, Allow/Deny)
           ──(6) redirect_uri?code=…&state=…&iss=…
MCP client ──(7) POST /oauth/token (code + PKCE verifier + resource) ─▶ access + refresh token
           ──(8) POST /mcp with Authorization: Bearer …
```

The MCP server is the OAuth **resource server**. It also hosts a small **authorization server** in front of Firebase Auth, because Firebase Auth can't issue audience-bound OAuth tokens to third-party clients by itself:

- The consent page (`/oauth/consent`) signs the member in with Facebook through the Firebase Web SDK, using the same config as `public/login.html`. It sends the Firebase ID token back over a same-origin POST.
- The server verifies that ID token (with revocation checks) and requires `users/{uid}.directoryStatus == "approved"`. That's the same gate the directory page uses. It then issues its **own** opaque tokens. Firebase ID tokens are never accepted at `/mcp` and never given to clients.
- Access tokens last 1 hour and are bound to the `https://…/mcp` resource (RFC 8707). Refresh tokens last 30 days, rotate on every use, and a replayed refresh token or code revokes the whole grant.
- Tokens, codes and client secrets are stored only as SHA-256 hashes in Firestore (`mcp_oauth_*` collections, reachable only via the Admin SDK). Firestore TTL policies delete expired records.
- Every request re-checks directory approval. A member who is un-approved or deleted loses access on their next call.

Spec features implemented: Protected Resource Metadata (RFC 9728), AS Metadata (RFC 8414), PKCE S256 only, resource indicators (RFC 8707), `iss` in authorization responses (RFC 9207), Client ID Metadata Documents (fetched with SSRF protections), Dynamic Client Registration (RFC 7591, kept for older clients), token revocation (RFC 7009), per-tool `insufficient_scope` step-up challenges, exact redirect-URI matching (any port for loopback), a consent screen that shows the client and the redirect host, clickjacking and CSRF protection, Origin validation on `/mcp`, and rate limiting.

## Layout

```
src/
  index.js            Firebase Functions entry (export `mcp`)
  app.js              Express app: discovery docs, /oauth, /mcp
  mcpServer.js        Tool definitions
  config.js           URLs, scopes, token lifetimes
  identity.js         Firebase Auth + directory approval check
  rateLimit.js
  directory/          Firestore reads (source.js) and search/category logic (directory.js)
  oauth/              Authorization server: service.js (core), router.js (HTTP), pages.js (consent UI),
                      store.js (Firestore/in-memory), cimd.js, clientMetadata.js, crypto.js
test/                 node:test suites (OAuth flows, SDK client end-to-end, SSRF guards)
scripts/dev-server.js Local server with fake data and fake sign-in
```

## Development

```bash
cd mcp
npm install
npm test                       # or: ./scripts/run_tests.sh --type unit --category mcp
npm run dev                    # http://localhost:8787/mcp with sample data and a "dev user" sign-in
npx @modelcontextprotocol/inspector   # then connect to http://localhost:8787/mcp
```

The dev server never touches Firebase.

## Deployment

`firebase.json` registers this folder as the `mcp` functions codebase and adds Hosting rewrites, so the server runs on the website's own origin:

| Path | Purpose |
| --- | --- |
| `/mcp` | MCP endpoint |
| `/oauth/**` | authorize, consent, token, register, revoke |
| `/.well-known/oauth-protected-resource[/**]` | RFC 9728 metadata |
| `/.well-known/oauth-authorization-server` | RFC 8414 metadata |

Using the site's own origin is required: Firebase Auth sign-in only works on authorized domains, and the consent page loads `/firebase-config.js` and `/images` from Hosting.

```bash
firebase deploy -P staging --only functions:mcp,hosting,firestore:indexes
# or everything, as usual:
./scripts/deploy.sh staging
```

A `predeploy` hook runs `npm ci` in this folder, because the Firebase CLI loads the code locally to find the function.

**First deploy to each project:** the Google Cloud organization enforces Domain Restricted Sharing, which blocks granting `allUsers` access. Firebase can't make the function public itself; the first deploy reports "Unable to set the invoker for the IAM policy" and the function returns 403. Make it public the same way as the site's other functions, by turning off Cloud Run's invoker IAM check (a one-time step per project):

```bash
gcloud run services update mcp --no-invoker-iam-check --region us-central1 --project scarsdale-buzz-staging
```

This setting survives later deploys. OAuth still protects `/mcp`; only the discovery documents and the sign-in pages are open to anyone.

Deploy the function before (or together with) Hosting so the rewrites have a target. `firestore:indexes` creates the TTL policies on `expireAt`.

Configuration (optional environment variables, e.g. in `mcp/.env.<project>`):

- `MCP_PUBLIC_URL`: public origin. Defaults to `https://scarsdalebuzz.com` for prod and `https://scarsdale-buzz-staging.web.app` for staging.
- `MCP_ALLOWED_ORIGINS`: comma-separated extra browser origins allowed to call `/mcp`. Native and server-side clients send no `Origin` and are unaffected.

## Connecting a client

Give the client the URL `https://scarsdalebuzz.com/mcp`. It discovers everything else. For example, in Claude go to **Settings → Connectors → Add custom connector** and paste the URL. When the client opens the browser, sign in with Facebook and click **Allow access**.

Redirect URIs must be `https://` or loopback `http://` (MCP spec requirement), so clients that register custom-scheme redirect URIs are refused.
