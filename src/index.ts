#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MobbinAuth } from "./services/auth.js";
import { MobbinApiClient } from "./services/api-client.js";
import {
  formatApps,
  formatScreens,
  formatFlows,
  formatCollections,
  formatScreenDetail,
  formatFilterFacet,
  formatAppPageScreens,
} from "./utils/formatting.js";
import { DEFAULT_PAGE_SIZE } from "./constants.js";
import type { DictionaryCategory } from "./types.js";
import { readStoredSession, writeStoredSession } from "./utils/auth-store.js";

type FilterKind = "categories" | "patterns" | "elements" | "actions";

// Substring match on the upstream category slug. Loose on purpose: the API has
// shipped a few different slug formats (`app_categories` vs `appCategories`),
// and a substring keeps us resilient. If we ever see a kind match zero or
// multiple categories in practice, tighten to exact strings here.
const KIND_MATCHERS: Record<FilterKind, (slug: string) => boolean> = {
  categories: (s) => s.includes("categor"),
  patterns: (s) => s.includes("pattern"),
  elements: (s) => s.includes("element"),
  actions: (s) => s.includes("action"),
};

const DICT_TTL_MS = 60 * 60 * 1000;

async function main() {
  // CLI subcommand routing
  if (process.argv[2] === "auth") {
    const { runAuthFlow } = await import("./cli/auth.js");
    await runAuthFlow();
    return;
  }

  // Resolve authentication: stored session first, then cookie fallback
  let auth: MobbinAuth;

  const storedSession = readStoredSession();
  if (storedSession) {
    auth = MobbinAuth.fromSession(storedSession, (newSession) => {
      writeStoredSession(newSession);
    });
  } else {
    const cookieValue = process.env.MOBBIN_AUTH_COOKIE;
    if (!cookieValue) {
      console.error(
        "Error: No authentication found.\n\n" +
          "Option 1 (recommended): Run 'npx mobbin-mcp auth' to log in with your email.\n\n" +
          "Option 2: Set the MOBBIN_AUTH_COOKIE environment variable.\n" +
          "  1. Open mobbin.com and log in\n" +
          "  2. Open DevTools > Application > Cookies\n" +
          "  3. Copy the full cookie string (all cookies for mobbin.com)\n" +
          "  4. Set MOBBIN_AUTH_COOKIE to that value",
      );
      process.exit(1);
    }
    auth = MobbinAuth.fromCookie(cookieValue);
  }

  const client = new MobbinApiClient(auth);

  let dictCache: { at: number; value: DictionaryCategory[] } | null = null;
  async function getDictionary(): Promise<DictionaryCategory[]> {
    if (dictCache && Date.now() - dictCache.at < DICT_TTL_MS) return dictCache.value;
    const result = await client.getDictionaryDefinitions();
    dictCache = { at: Date.now(), value: result.value };
    return dictCache.value;
  }

  const server = new McpServer({
    name: "mobbin",
    version: "1.0.0",
    description:
      "Search and browse Mobbin design inspiration — apps, screens, flows, and collections",
  });

  // --- Search Apps ---
  server.tool(
    "mobbin_search_apps",
    "Search and browse apps on Mobbin by category and platform. Returns app names, logos, preview screens, and version IDs for deeper exploration. " +
      "Use when: you want catalog discovery by platform or category. Prefer mobbin_quick_search when you already know the app name and need its app_id.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Filter by app categories (e.g., 'Finance', 'AI', 'Music & Audio')"),
      sort_by: z.enum(["publishedAt"]).default("publishedAt").describe("Sort order"),
      page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({ platform, categories, sort_by, page_size, page_index }) => {
      const result = await client.searchApps({
        platform,
        appCategories: categories,
        pageSize: page_size,
        pageIndex: page_index,
        sortBy: sort_by,
      });
      return {
        content: [{ type: "text", text: formatApps(result.value.data) }],
      };
    },
  );

  // --- Search Screens ---
  server.tool(
    "mobbin_search_screens",
    "Search screens across all apps on Mobbin. Filter by screen patterns (e.g., 'Login', 'Settings'), UI elements (e.g., 'Card', 'Table'), or text content. Returns screenshot URLs and metadata. " +
      "Use when: you want global screen inspiration across apps. Use screen_patterns for Mobbin taxonomy concepts, screen_keywords for visible/OCR text, and mobbin_get_app_screens after mobbin_quick_search when the user names a specific app.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
      screen_patterns: z
        .array(z.string())
        .optional()
        .describe(
          "Screen patterns to filter by (e.g., 'Login', 'Checkout', 'Profile', 'Settings')",
        ),
      screen_elements: z
        .array(z.string())
        .optional()
        .describe(
          "UI elements to filter by (e.g., 'Card', 'Table', 'Dropdown Menu', 'Text Field')",
        ),
      screen_keywords: z
        .array(z.string())
        .optional()
        .describe("Text keywords found in screenshots"),
      categories: z.array(z.string()).optional().describe("Filter by app categories"),
      has_animation: z.boolean().optional().describe("Filter for animated screens only"),
      sort_by: z.enum(["trending", "publishedAt"]).default("trending").describe("Sort order"),
      page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({
      platform,
      screen_patterns,
      screen_elements,
      screen_keywords,
      categories,
      has_animation,
      sort_by,
      page_size,
      page_index,
    }) => {
      const result = await client.searchScreens({
        platform,
        screenPatterns: screen_patterns,
        screenElements: screen_elements,
        screenKeywords: screen_keywords,
        appCategories: categories,
        hasAnimation: has_animation,
        pageSize: page_size,
        pageIndex: page_index,
        sortBy: sort_by,
      });
      return {
        content: [{ type: "text", text: formatScreens(result.value.data) }],
      };
    },
  );

  // --- Search Flows ---
  server.tool(
    "mobbin_search_flows",
    "Search user flows/journeys across all apps on Mobbin. Filter by flow actions (e.g., 'Creating Account', 'Editing Profile'). Returns flow screens with hotspot data for prototyping. " +
      "Use when: you want global journey inspiration by action type. Prefer mobbin_get_app_flows after mobbin_quick_search when the user asks about flows for a specific app.",
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
      flow_actions: z
        .array(z.string())
        .optional()
        .describe(
          "Flow actions to filter by (e.g., 'Creating Account', 'Filtering & Sorting', 'Editing Profile')",
        ),
      categories: z.array(z.string()).optional().describe("Filter by app categories"),
      sort_by: z.enum(["trending", "publishedAt"]).default("trending").describe("Sort order"),
      page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({ platform, flow_actions, categories, sort_by, page_size, page_index }) => {
      const result = await client.searchFlows({
        platform,
        flowActions: flow_actions,
        appCategories: categories,
        pageSize: page_size,
        pageIndex: page_index,
        sortBy: sort_by,
      });
      return {
        content: [{ type: "text", text: formatFlows(result.value.data) }],
      };
    },
  );

  // --- Quick Search (Autocomplete) ---
  server.tool(
    "mobbin_quick_search",
    "Quick autocomplete search for apps by name. Returns matching app IDs and names. Use this for fast lookup before fetching full details. " +
      "Use when: you have an app name or likely app name and need its app_id. Prefer mobbin_search_apps for browsing apps by platform/category, then use the app_id with mobbin_get_app_screens or mobbin_get_app_flows for app-specific results.",
    {
      query: z.string().describe("Search query (app name or keyword)"),
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
    },
    async ({ query, platform }) => {
      const [searchResult, allApps] = await Promise.all([
        client.autocompleteSearch({ query, platform }),
        client.getSearchableApps(platform),
      ]);

      const appMap = new Map(allApps.map((a) => [a.id, a]));
      const matchedApps = [...searchResult.value.primary, ...searchResult.value.other]
        .filter((item) => item.type === "app")
        .map((item) => appMap.get(item.id))
        .filter(Boolean);

      if (matchedApps.length === 0) {
        return { content: [{ type: "text", text: "No apps found." }] };
      }

      const text = matchedApps
        .map((app, i) =>
          [
            `${i + 1}. **${app!.appName}** — ${app!.appTagline}`,
            `   ID: ${app!.id} | Platform: ${app!.platform}`,
            `   Logo: ${app!.appLogoUrl}`,
          ].join("\n"),
        )
        .join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  );

  // --- Get App Screens ---
  // The documented `search-screens` endpoint silently ignores per-app filters,
  // so we can't drill into a single app via the search API. Instead, this tool
  // (and `mobbin_get_app_flows`) reads from the SSR'd app-detail page, which
  // is the same source the Mobbin web UI uses.
  server.tool(
    "mobbin_get_app_screens",
    "Get all screens for a specific app on Mobbin. Pair with mobbin_quick_search to drill into one app: quick_search -> app_id -> get_app_screens. Returns every screen for that app with patterns, elements, and dimensions. " +
      "Use when: the user names a specific app and wants that app's screens. Prefer mobbin_search_screens for broad cross-app examples by pattern, element, keyword, or category.",
    {
      app_id: z
        .string()
        .uuid()
        .describe("App ID from mobbin_quick_search"),
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("App platform"),
      page_size: z
        .number()
        .min(1)
        .max(50)
        .default(DEFAULT_PAGE_SIZE)
        .describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({ app_id, platform, page_size, page_index }) => {
      const { screens, appName } = await client.getAppPage({ appId: app_id, platform });
      const start = page_index * page_size;
      const slice = screens.slice(start, start + page_size);
      const header = `**${appName}** (${platform}) — ${screens.length} screens total. Showing ${start + 1}–${Math.min(start + slice.length, screens.length)}.\n\n`;
      return {
        content: [{ type: "text", text: header + formatAppPageScreens(slice) }],
      };
    },
  );

  // --- Get App Flows ---
  server.tool(
    "mobbin_get_app_flows",
    "Get all user flows for a specific app on Mobbin. Pair with mobbin_quick_search: quick_search -> app_id -> get_app_flows. Returns each flow's screens with hotspot data for prototyping. " +
      "Use when: the user names a specific app and wants that app's flows. Prefer mobbin_search_flows for broad cross-app journey examples by action or category.",
    {
      app_id: z
        .string()
        .uuid()
        .describe("App ID from mobbin_quick_search"),
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("App platform"),
      page_size: z
        .number()
        .min(1)
        .max(50)
        .default(DEFAULT_PAGE_SIZE)
        .describe("Results per page"),
      page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
    },
    async ({ app_id, platform, page_size, page_index }) => {
      const { flows, appName } = await client.getAppPage({ appId: app_id, platform });
      const start = page_index * page_size;
      const slice = flows.slice(start, start + page_size);
      const header = `**${appName}** (${platform}) — ${flows.length} flows total. Showing ${start + 1}–${Math.min(start + slice.length, flows.length)}.\n\n`;
      return {
        content: [{ type: "text", text: header + formatFlows(slice) }],
      };
    },
  );

  // --- Popular Apps ---
  server.tool(
    "mobbin_popular_apps",
    "Get the most popular apps on Mobbin, grouped by category. Great for discovering trending design inspiration. " +
      'Use when: you want a category-grouped popularity snapshot. Prefer mobbin_search_apps with sort_by: "publishedAt" when you need paginated recent app browsing or category filters.',
    {
      platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform"),
      limit_per_category: z.number().min(1).max(20).default(10).describe("Max apps per category"),
    },
    async ({ platform, limit_per_category }) => {
      const result = await client.getPopularApps({
        platform,
        limitPerCategory: limit_per_category,
      });

      const apps = result.value;
      if (apps.length === 0) {
        return { content: [{ type: "text", text: "No popular apps found." }] };
      }

      const grouped = new Map<string, typeof apps>();
      for (const app of apps) {
        const cat = app.app_category;
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(app);
      }

      const text = Array.from(grouped.entries())
        .map(
          ([cat, catApps]) =>
            `## ${cat}\n` +
            catApps
              .map(
                (a, i) =>
                  `${i + 1}. **${a.app_name}** (popularity: ${a.popularity_metric})\n   ID: ${a.app_id}\n   Logo: ${a.app_logo_url}`,
              )
              .join("\n"),
        )
        .join("\n\n");

      return { content: [{ type: "text", text }] };
    },
  );

  // --- Collections ---
  server.tool(
    "mobbin_list_collections",
    "List your saved Mobbin collections with item counts. " +
      "Use when: you need saved collection names, IDs, and app/screen/flow counts. This lists collection metadata only; collection item fetching is not available until mobbin_get_collection lands.",
    {},
    async () => {
      const result = await client.getCollections();
      return {
        content: [{ type: "text", text: formatCollections(result.value) }],
      };
    },
  );

  // --- Filter Taxonomy ---
  server.tool(
    "mobbin_get_filters",
    "Get valid values for one Mobbin filter facet (categories, patterns, elements, or actions). " +
      "Returns a plain newline list of names by default — pass include_definitions or include_counts to enrich. " +
      "Use the result to build the categories, screen_patterns, screen_elements, or flow_actions params on the search tools. " +
      "Use when: you need valid filter values or definitions instead of guessing names for any mobbin_search_* filter.",
    {
      kind: z
        .enum(["categories", "patterns", "elements", "actions"])
        .describe(
          "Which filter facet to fetch. Use the kind matching the search-tool param you're filling: " +
            "'categories' → appCategories, 'patterns' → screenPatterns, " +
            "'elements' → screenElements, 'actions' → flowActions.",
        ),
      include_definitions: z
        .boolean()
        .default(false)
        .describe(
          "Include the human-readable definition for each value. Off by default to keep the response small.",
        ),
      include_counts: z
        .boolean()
        .default(false)
        .describe(
          "Include per-tag content counts. Off by default — counts aren't needed to construct queries.",
        ),
    },
    async ({ kind, include_definitions, include_counts }) => {
      try {
        const all = await getDictionary();
        const matcher = KIND_MATCHERS[kind];
        const matched = all.filter((cat) => matcher(cat.slug.toLowerCase()));
        const text = formatFilterFacet(matched, {
          includeDefinitions: include_definitions,
          includeCounts: include_counts,
        });
        return { content: [{ type: "text", text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to fetch filters: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- Get Screen Detail ---
  server.tool(
    "mobbin_get_screen_detail",
    "Fetch a full screenshot image and metadata for a specific screen. Use a screenUrl from search_screens, search_flows, or get_app_screens results. Returns the actual image so you can see the UI design. " +
      "Use when: you already have a screen_url and need the full image, visual inspection, metadata, or optional dominant color extraction.",
    {
      screen_url: z
        .string()
        .url()
        .describe("The screen image URL from a previous search result (screenUrl field)"),
      screen_id: z.string().optional().describe("Screen ID from search results"),
      app_name: z.string().optional().describe("App name from search results"),
      screen_patterns: z.array(z.string()).optional().describe("UI patterns from search results"),
      screen_elements: z.array(z.string()).optional().describe("UI elements from search results"),
      dimensions: z
        .object({ width: z.number(), height: z.number() })
        .optional()
        .describe("Image dimensions from search result metadata"),
      extract_colors: z
        .boolean()
        .optional()
        .default(false)
        .describe("Extract dominant hex colors from the screenshot"),
    },
    async ({
      screen_url,
      screen_id,
      app_name,
      screen_patterns,
      screen_elements,
      dimensions,
      extract_colors,
    }) => {
      try {
        const { base64, mimeType, sizeBytes, buffer } = await client.fetchScreenImage(screen_url);

        let dominantColors: string[] | undefined;
        if (extract_colors) {
          dominantColors = await client.extractColors(buffer);
        }

        const metadataText = formatScreenDetail({
          screenUrl: screen_url,
          screenId: screen_id,
          appName: app_name,
          screenPatterns: screen_patterns,
          screenElements: screen_elements,
          dimensions,
          imageSizeBytes: sizeBytes,
          mimeType,
          dominantColors,
        });

        return {
          content: [
            { type: "text" as const, text: metadataText },
            { type: "image" as const, data: base64, mimeType },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch screen image: ${message}\n\nURL attempted: ${screen_url}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // --- Start Server ---
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
