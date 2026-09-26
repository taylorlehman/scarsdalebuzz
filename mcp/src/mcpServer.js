import * as z from 'zod';
import { McpServer, requireScopes } from '@modelcontextprotocol/server';
import { SCOPES } from './config.js';
import { DirectoryError } from './directory/directory.js';

export const SERVER_INFO = Object.freeze({
  name: 'scarsdale-buzz',
  title: 'Scarsdale Buzz',
  version: '1.0.0',
});

const INSTRUCTIONS = `Scarsdale Buzz is a neighbor-recommended directory of local service providers \
(contractors, cleaners, tutors, etc.) in Scarsdale, NY.

- To find a specific business or person, use search_providers with their name.
- To browse, use list_category_groups or list_categories, then list_providers_in_category.
- list_saved_providers returns the providers the signed-in user saved to their Recommendations.
- recommendationCount is how many Scarsdale Buzz members recommend a provider; higher is better.
- Contact details are shared with members for personal use; don't republish them.`;

// Every tool here only reads directory data.
const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const Provider = z.object({
  id: z.string().describe('Stable provider id; pass to get_provider'),
  name: z.string().describe('Display name (business name, or the person’s name)'),
  businessName: z.string().nullable(),
  contactName: z.string().nullable().describe('Person to ask for, when the provider is a business'),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  categories: z.array(z.string()),
  recommendationCount: z.number().int().describe('Number of Scarsdale Buzz members who recommend this provider'),
  lastRecommendedAt: z.string().nullable().describe('ISO 8601 time of the most recent recommendation'),
  sunnyApproved: z.boolean().describe('Available through Sunny, the Scarsdale Buzz concierge'),
  directoryUrl: z.string().describe('Where to view this provider on scarsdalebuzz.com'),
});

const SavedProvider = Provider.extend({
  savedAt: z.string().nullable().describe('ISO 8601 time the user saved this provider'),
});

/** Tool result carrying both structured data and the same JSON as text for older clients. */
function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** A tool execution error the model can read and recover from. */
function toolError(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function withErrors(handler, onError) {
  return async (args, ctx) => {
    try {
      return await handler(args, ctx);
    } catch (err) {
      if (err instanceof DirectoryError) return toolError(err.message);
      onError(err);
      return toolError('The Scarsdale Buzz directory is temporarily unavailable. Please try again shortly.');
    }
  };
}

/**
 * Builds a fresh McpServer for one request (createMcpHandler is stateless).
 * @param {object} deps
 * @param {import('./directory/directory.js').DirectoryService} deps.directory
 * @param {(err: Error) => void} [deps.onError]
 */
export function createMcpServer({ directory, onError = () => {} }) {
  const server = new McpServer(
    {
      ...SERVER_INFO,
      websiteUrl: directory.origin,
      // Shown by clients (e.g. Claude's connector list) instead of a guessed favicon.
      icons: [
        { src: `${directory.origin}/images/logos/bee-icon-192.png`, mimeType: 'image/png', sizes: ['192x192'] },
        { src: `${directory.origin}/images/logos/bee-icon-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
      ],
    },
    {
      instructions: INSTRUCTIONS,
      // Tool definitions only change on deploy.
      cacheHints: { 'tools/list': { ttlMs: 60 * 60 * 1000, cacheScope: 'public' } },
    },
  );
  const directoryScope = requireScopes(SCOPES.DIRECTORY_READ);

  server.registerTool(
    'search_providers',
    {
      title: 'Search providers by name',
      description:
        'Find Scarsdale Buzz providers (businesses or individuals) by name and return their details, ' +
        'including phone, email, categories and how many neighbors recommend them. Tolerates partial names and small typos.',
      inputSchema: z.object({
        query: z.string().trim().min(1).max(100).describe('Full or partial provider name, e.g. "Joe\'s Plumbing"'),
        limit: z.number().int().min(1).max(25).default(10).describe('Maximum providers to return'),
      }),
      outputSchema: z.object({
        query: z.string(),
        totalMatches: z.number().int(),
        providers: z.array(Provider).describe('Best matches first'),
      }),
      annotations: READ_ONLY,
      scopeChallenge: directoryScope,
    },
    withErrors(async ({ query, limit }) => ok(await directory.searchProviders(query, limit)), onError),
  );

  server.registerTool(
    'get_provider',
    {
      title: 'Get provider details',
      description: 'Get full details for one provider by its id (from search or list results).',
      inputSchema: z.object({
        provider_id: z.string().trim().min(1).max(200).describe('Provider id'),
      }),
      outputSchema: z.object({ provider: Provider }),
      annotations: READ_ONLY,
      scopeChallenge: directoryScope,
    },
    withErrors(async ({ provider_id }) => ok({ provider: await directory.getProvider(provider_id) }), onError),
  );

  server.registerTool(
    'list_providers_in_category',
    {
      title: 'List providers in a category',
      description:
        'List every provider in a category (e.g. "Plumbers"), most-recommended first, with their details. ' +
        'Category names are matched case-insensitively. Results are paginated: pass nextCursor back as cursor to get more.',
      inputSchema: z.object({
        category: z.string().trim().min(1).max(100).describe('Category name from list_categories'),
        limit: z.number().int().min(1).max(100).default(50).describe('Page size'),
        cursor: z.string().max(500).optional().describe('nextCursor from a previous call'),
      }),
      outputSchema: z.object({
        category: z.string().describe('Canonical category name'),
        categoryUrl: z.string(),
        totalProviders: z.number().int(),
        providers: z.array(Provider),
        nextCursor: z.string().optional().describe('Present when more providers are available'),
      }),
      annotations: READ_ONLY,
      scopeChallenge: directoryScope,
    },
    withErrors(
      async ({ category, limit, cursor }) => ok(await directory.listProvidersInCategory(category, { limit, cursor })),
      onError,
    ),
  );

  server.registerTool(
    'list_categories',
    {
      title: 'List categories',
      description:
        'List all provider categories with the group each belongs to and how many providers it has. ' +
        'Optionally filter to one category group.',
      inputSchema: z.object({
        group: z.string().trim().min(1).max(100).optional().describe('Only categories in this group'),
      }),
      outputSchema: z.object({
        totalCategories: z.number().int(),
        categories: z.array(
          z.object({
            name: z.string(),
            group: z.string().nullable(),
            providerCount: z.number().int(),
          }),
        ),
      }),
      annotations: READ_ONLY,
      scopeChallenge: directoryScope,
    },
    withErrors(async ({ group }) => ok(await directory.listCategories({ group })), onError),
  );

  server.registerTool(
    'list_category_groups',
    {
      title: 'List category groups',
      description: 'List the category groups (e.g. "Home Services") and the categories in each.',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        totalGroups: z.number().int(),
        groups: z.array(z.object({ name: z.string(), categories: z.array(z.string()) })),
        ungroupedCategories: z.array(z.string()).describe('Categories not assigned to any group'),
      }),
      annotations: READ_ONLY,
      scopeChallenge: directoryScope,
    },
    withErrors(async () => ok(await directory.listCategoryGroups()), onError),
  );

  server.registerTool(
    'list_saved_providers',
    {
      title: 'List my saved providers',
      description:
        'List the providers the signed-in user has saved to their Scarsdale Buzz Recommendations ' +
        '("My Recommendations" on the website), most recently saved first.',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        totalSaved: z.number().int(),
        providers: z.array(SavedProvider),
      }),
      annotations: READ_ONLY,
      scopeChallenge: requireScopes(SCOPES.SAVED_READ),
    },
    withErrors(async (_args, ctx) => {
      const uid = ctx.http?.authInfo?.extra?.uid;
      if (typeof uid !== 'string') throw new Error('Missing authenticated user');
      return ok(await directory.listSavedProviders(uid));
    }, onError),
  );

  return server;
}
