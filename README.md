# Mobbin MCP Server

An MCP server that connects to [Mobbin](https://mobbin.com) — the design inspiration platform with 600k+ screens from 1,100+ apps. Search apps, browse screenshots, explore user flows, and access your saved collections directly from Claude.

Mobbin has no public API. This server was built by reverse-engineering their internal endpoints using Playwright.

## Tools

| Tool | Description |
|------|-------------|
| `mobbin_search_apps` | Search and browse apps by category and platform |
| `mobbin_search_screens` | Search screens by UI patterns, elements, or text content |
| `mobbin_search_flows` | Search user flows by action type (e.g., onboarding, checkout) |
| `mobbin_quick_search` | Fast autocomplete search for apps by name |
| `mobbin_popular_apps` | Get popular apps grouped by category |
| `mobbin_list_collections` | List your saved collections |
| `mobbin_get_filters` | Get all available filter values (categories, patterns, elements, actions) |

## Setup

### Prerequisites

- Node.js 18+
- A [Mobbin](https://mobbin.com) account (free or paid)

### 1. Clone and install

```bash
git clone https://github.com/pdcolandrea/mobbin-mcp.git
cd mobbin-mcp
npm install
```

### 2. Authenticate

**Option A: CLI command (recommended)**

```bash
npx tsx src/index.ts auth
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

6. Set `MOBBIN_AUTH_COOKIE` to that value (see step 3 below)

### 3. Add to Claude Code

```bash
claude mcp add mobbin -- npx tsx /path/to/mobbin-mcp/src/index.ts
```

If you used the CLI auth command (Option A), no additional config is needed — the server reads from `~/.mobbin-mcp/auth.json` automatically.

If using the environment variable (Option B), add the env var to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "npx",
      "args": ["tsx", "/path/to/mobbin-mcp/src/index.ts"],
      "env": {
        "MOBBIN_AUTH_COOKIE": "sb-ujasntkfphywizsdaapi-auth-token.0=...; sb-ujasntkfphywizsdaapi-auth-token.1=..."
      }
    }
  }
}
```

### Alternative: Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "npx",
      "args": ["tsx", "/path/to/mobbin-mcp/src/index.ts"]
    }
  }
}
```

## Example prompts

- "Search Mobbin for fintech apps on iOS"
- "Find login screen designs across e-commerce apps"
- "Show me onboarding flows for AI apps"
- "What are the most popular apps on Mobbin right now?"
- "Search for screens with a Card UI element in finance apps"
- "List my saved collections"

## How it works

Mobbin is a Next.js app backed by Supabase. This server calls Mobbin's internal API routes (`/api/content/search-apps`, `/api/content/search-screens`, etc.) using your session cookie for authentication. Tokens are automatically refreshed via Supabase's `/auth/v1/token` endpoint before they expire, and persisted back to `~/.mobbin-mcp/auth.json` when using the CLI auth method.

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
