# Mobbin MCP Server

An unofficial MCP server that connects to [Mobbin](https://mobbin.com) — the design inspiration platform with 600k+ screens from 1,100+ apps. Search apps, browse screenshots, explore user flows, and access your saved collections directly from Claude.

Mobbin has no public API. This server was built by reverse-engineering their internal endpoints.

## Tools

| Tool                       | Description                                                                                  | Use when                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `mobbin_search_apps`       | Search and browse apps by category and platform                                              | You want catalog discovery by platform or category. Prefer `mobbin_quick_search` when you already know the app name and need its app ID. |
| `mobbin_search_screens`    | Search screens by UI patterns, elements, or text content                                     | You want global screen inspiration across apps. Use `screen_patterns` for Mobbin taxonomy concepts and `screen_keywords` for visible/OCR text. Use `mobbin_get_app_screens` after `mobbin_quick_search` for one named app. |
| `mobbin_search_flows`      | Search user flows by action type (e.g., onboarding, checkout)                                | You want global journey inspiration by action type. Prefer `mobbin_get_app_flows` after `mobbin_quick_search` for flows from one named app. |
| `mobbin_quick_search`      | Fast autocomplete search for apps by name                                                    | You have an app name or likely app name and need its app ID. Prefer `mobbin_search_apps` for platform/category browsing. |
| `mobbin_get_app_screens`   | Get every screen for one app (pair with `quick_search` to drill into a specific app)         | The user names a specific app and wants that app's screens. Prefer `mobbin_search_screens` for broad cross-app examples. |
| `mobbin_get_app_flows`     | Get every user flow for one app (pair with `quick_search` to drill into a specific app)      | The user names a specific app and wants that app's flows. Prefer `mobbin_search_flows` for broad cross-app journeys. |
| `mobbin_popular_apps`      | Get popular apps grouped by category                                                         | You want a category-grouped popularity snapshot. Prefer `mobbin_search_apps` with `sort_by: "publishedAt"` for paginated recent app browsing or category filters. |
| `mobbin_list_collections`  | List your saved collections                                                                  | You need saved collection names, IDs, and app/screen/flow counts. This lists metadata only; collection item fetching is not available until `mobbin_get_collection` lands. |
| `mobbin_get_screen_detail` | Fetch a full screenshot image for a specific screen, with optional dominant color extraction | You already have a `screen_url` and need the full image, visual inspection, metadata, or optional dominant color extraction. |
| `mobbin_get_filters`       | Get valid values for one filter facet: `kind: "categories" \| "patterns" \| "elements" \| "actions"` | You need valid filter values or definitions before filling `categories`, `screen_patterns`, `screen_elements`, or `flow_actions` on search tools. |

### Drilling into a specific app

`mobbin_search_screens` and `mobbin_search_flows` index Mobbin globally — they don't accept an `app_id` filter (the upstream API ignores per-app filters silently). For "show me Notion's onboarding"-style queries, use the two-step path: `mobbin_quick_search` to look up the app's `id`, then `mobbin_get_app_screens` or `mobbin_get_app_flows` with that `app_id`. The detail tools read from Mobbin's SSR'd app-detail page, so they return everything Mobbin has for that app.

### Migration: `mobbin_get_filters`

The no-arg form was removed. The full taxonomy in one response exceeded the MCP per-tool-result token cap and forced the agent to read the result back from a temp file. Pass a `kind` to scope the response to one facet:

```ts
mobbin_get_filters({ kind: "patterns" })                               // newline list of names
mobbin_get_filters({ kind: "patterns", include_definitions: true })    // bullets with descriptions
mobbin_get_filters({ kind: "patterns", include_counts: true })         // bullets with content counts
```

## Setup

### Prerequisites

- Node.js 18+
- A [Mobbin](https://mobbin.com) account (free or paid)

### 1. Authenticate

**Option A: CLI command (recommended)**

```bash
npx -y mobbin-mcp@latest auth
```

This will walk you through copying your session cookie from the browser:

1. Open [mobbin.com](https://mobbin.com) and log in
2. Open the browser console (`Cmd+Option+J`)
3. Run `copy(document.cookie)` to copy your cookies to clipboard
4. Paste into the CLI prompt

Your session is saved to `~/.mobbin-mcp/auth.json` and automatically refreshed.

> **What does `copy(document.cookie)` do?** It copies your browser's cookies for the current site (mobbin.com) to your clipboard. This includes your Supabase session tokens, which the MCP server needs to make API requests on your behalf. The cookies are stored locally on your machine at `~/.mobbin-mcp/auth.json` and are never sent anywhere except to Mobbin's API.

**Option B: Environment variable (manual)**

1. Open [mobbin.com](https://mobbin.com) in Chrome and log in
2. Open DevTools (`Cmd+Option+I`) → **Application** tab → **Cookies** → `https://mobbin.com`
3. Find the cookies named `sb-ujasntkfphywizsdaapi-auth-token.0` and `sb-ujasntkfphywizsdaapi-auth-token.1`
4. Copy the **full value** of each cookie
5. Combine them into a single string:

```
sb-ujasntkfphywizsdaapi-auth-token.0=<value0>; sb-ujasntkfphywizsdaapi-auth-token.1=<value1>
```

6. Set `MOBBIN_AUTH_COOKIE` to that value (see step 2 below)

### 2. Add to Claude Code

```bash
claude mcp add mobbin -- npx -y mobbin-mcp
```

If you used the CLI auth command (Option A), no additional config is needed — the server reads from `~/.mobbin-mcp/auth.json` automatically.

If using the environment variable (Option B), pass it when adding:

```bash
claude mcp add mobbin -e MOBBIN_AUTH_COOKIE="sb-ujasntkfphywizsdaapi-auth-token.0=...; sb-ujasntkfphywizsdaapi-auth-token.1=..." -- npx -y mobbin-mcp
```

### Alternative: Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "npx",
      "args": ["-y", "mobbin-mcp"]
    }
  }
}
```

## Example prompts

- "I'm designing a checkout flow for a food delivery app — show me how top apps like DoorDash and Uber Eats handle it"
- "Pull up the Duolingo onboarding flow and walk me through each screen's design decisions"
- "Find login screens that use bottom sheets and extract the color palette — I need inspiration for our auth redesign"
- "Compare how fintech apps handle settings screens — show me examples from Robinhood, Cash App, and Venmo"
- "Search for screens with card-based layouts in travel apps, then show me the best one in detail"
- "What UI patterns are trending right now on iOS? Show me the top screens"

## How it works

Mobbin is a Next.js app backed by Supabase. This server calls Mobbin's internal API routes (`/api/content/search-apps`, `/api/content/search-screens`, etc.) using your session cookie for authentication. Tokens are automatically refreshed via Supabase's `/auth/v1/token` endpoint before they expire, and persisted back to `~/.mobbin-mcp/auth.json` when using the CLI auth method.

Screen images are served through Mobbin's Bytescale CDN. The `mobbin_get_screen_detail` tool automatically converts Supabase storage URLs from search results into CDN URLs, fetches the image, and returns it as base64 content that the model can see and analyze. Optional color extraction uses [sharp](https://sharp.pixelplumbing.com/) to return dominant hex colors from the screenshot.

## Project structure

```
src/
  index.ts              # MCP server entry point, CLI routing, and tool registration
  constants.ts          # API URLs, keys, and config
  types.ts              # TypeScript interfaces for all Mobbin data models
  cli/
    auth.ts             # Interactive CLI authentication flow
  services/
    auth.ts             # Token parsing, expiry checks, and auto-refresh
    api-client.ts       # HTTP client for all Mobbin API endpoints
  utils/
    auth-store.ts       # Persistent session storage (~/.mobbin-mcp/auth.json)
    formatting.ts       # Markdown formatters for tool responses
```

## License

ISC
