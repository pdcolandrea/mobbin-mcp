#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MobbinAuth } from "./services/auth";
import { MobbinApiClient } from "./services/api-client";
import { formatApps, formatScreens, formatFlows, formatCollections } from "./utils/formatting";
import { DEFAULT_PAGE_SIZE } from "./constants";

const cookieValue = process.env.MOBBIN_AUTH_COOKIE;
if (!cookieValue) {
  console.error(
    "Error: MOBBIN_AUTH_COOKIE environment variable is required.\n" +
    "Extract it from your browser after logging into mobbin.com:\n" +
    "1. Open mobbin.com and log in\n" +
    "2. Open DevTools > Application > Cookies\n" +
    '3. Copy the full cookie string (all cookies for mobbin.com)\n' +
    "4. Set MOBBIN_AUTH_COOKIE to that value"
  );
  process.exit(1);
}

const auth = new MobbinAuth(cookieValue);
const client = new MobbinApiClient(auth);

const server = new McpServer({
  name: "mobbin",
  version: "1.0.0",
  description: "Search and browse Mobbin design inspiration — apps, screens, flows, and collections",
});

// --- Search Apps ---
server.tool(
  "mobbin_search_apps",
  "Search and browse apps on Mobbin by category and platform. Returns app names, logos, preview screens, and version IDs for deeper exploration.",
  {
    platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
    categories: z.array(z.string()).optional().describe("Filter by app categories (e.g., 'Finance', 'AI', 'Music & Audio')"),
    sort_by: z.enum(["publishedAt", "trending", "popular", "top"]).default("publishedAt").describe("Sort order"),
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
  }
);

// --- Search Screens ---
server.tool(
  "mobbin_search_screens",
  "Search screens across all apps on Mobbin. Filter by screen patterns (e.g., 'Login', 'Settings'), UI elements (e.g., 'Card', 'Table'), or text content. Returns screenshot URLs and metadata.",
  {
    platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
    screen_patterns: z.array(z.string()).optional().describe("Screen patterns to filter by (e.g., 'Login', 'Checkout', 'Profile', 'Settings')"),
    screen_elements: z.array(z.string()).optional().describe("UI elements to filter by (e.g., 'Card', 'Table', 'Dropdown Menu', 'Text Field')"),
    screen_keywords: z.array(z.string()).optional().describe("Text keywords found in screenshots"),
    categories: z.array(z.string()).optional().describe("Filter by app categories"),
    has_animation: z.boolean().optional().describe("Filter for animated screens only"),
    sort_by: z.enum(["trending", "publishedAt"]).default("trending").describe("Sort order"),
    page_size: z.number().min(1).max(50).default(DEFAULT_PAGE_SIZE).describe("Results per page"),
    page_index: z.number().min(0).default(0).describe("Page number (0-indexed)"),
  },
  async ({ platform, screen_patterns, screen_elements, screen_keywords, categories, has_animation, sort_by, page_size, page_index }) => {
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
  }
);

// --- Search Flows ---
server.tool(
  "mobbin_search_flows",
  "Search user flows/journeys across all apps on Mobbin. Filter by flow actions (e.g., 'Creating Account', 'Editing Profile'). Returns flow screens with hotspot data for prototyping.",
  {
    platform: z.enum(["ios", "android", "web"]).default("ios").describe("Platform to search"),
    flow_actions: z.array(z.string()).optional().describe("Flow actions to filter by (e.g., 'Creating Account', 'Filtering & Sorting', 'Editing Profile')"),
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
  }
);

// --- Quick Search (Autocomplete) ---
server.tool(
  "mobbin_quick_search",
  "Quick autocomplete search for apps by name. Returns matching app IDs and names. Use this for fast lookup before fetching full details.",
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
    const matchedApps = [
      ...searchResult.value.primary,
      ...searchResult.value.other,
    ]
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
        ].join("\n")
      )
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  }
);

// --- Popular Apps ---
server.tool(
  "mobbin_popular_apps",
  "Get the most popular apps on Mobbin, grouped by category. Great for discovering trending design inspiration.",
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
                `${i + 1}. **${a.app_name}** (popularity: ${a.popularity_metric})\n   ID: ${a.app_id}\n   Logo: ${a.app_logo_url}`
            )
            .join("\n")
      )
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  }
);

// --- Collections ---
server.tool(
  "mobbin_list_collections",
  "List your saved Mobbin collections with item counts.",
  {},
  async () => {
    const result = await client.getCollections();
    return {
      content: [{ type: "text", text: formatCollections(result.value) }],
    };
  }
);

// --- Filter Taxonomy ---
server.tool(
  "mobbin_get_filters",
  "Get all available filter options for Mobbin search — app categories, screen patterns, UI elements, and flow actions. Use this to discover valid filter values for other search tools.",
  {},
  async () => {
    const result = await client.getDictionaryDefinitions();
    const categories = result.value as Array<{
      slug: string;
      displayName: string;
      experience: string;
      subCategories: Array<{
        entries: Array<{
          displayName: string;
          definition: string;
          contentCounts: Record<string, Record<string, number>>;
        }>;
      }>;
    }>;

    const text = categories
      .map((cat) => {
        const entries = cat.subCategories
          .flatMap((sub) => sub.entries)
          .filter((e) => !("hidden" in e && e.hidden))
          .map((e) => {
            const counts = Object.entries(e.contentCounts)
              .flatMap(([type, platforms]) =>
                Object.entries(platforms).map(([p, c]) => `${p} ${type}: ${c}`)
              )
              .join(", ");
            return `  - **${e.displayName}**: ${e.definition.substring(0, 80)}${e.definition.length > 80 ? "..." : ""} (${counts})`;
          });

        return `## ${cat.displayName} (${cat.experience})\nSlug: \`${cat.slug}\`\n${entries.join("\n")}`;
      })
      .join("\n\n");

    return { content: [{ type: "text", text }] };
  }
);

// --- Start Server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
