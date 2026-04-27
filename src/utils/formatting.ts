import { CHARACTER_LIMIT } from "../constants.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  CollectionItem,
  DictionaryCategory,
  AppPageScreen,
} from "../types.js";

export function formatApps(apps: AppResult[]): string {
  if (apps.length === 0) return "No apps found.";

  const lines = apps.map((app, i) => {
    const screens = app.previewScreens
      .slice(0, 2)
      .map((s) => s.screenUrl)
      .join("\n    ");
    return [
      `### ${i + 1}. ${app.appName}`,
      `- **Tagline**: ${app.appTagline}`,
      `- **Category**: ${app.allAppCategories.join(", ")}`,
      `- **Platform**: ${app.platform}`,
      `- **App ID**: ${app.id}`,
      `- **Version ID**: ${app.appVersionId}`,
      `- **Popularity**: ${app.popularityMetric} | **Trending**: ${app.trendingMetric}`,
      `- **Logo**: ${app.appLogoUrl}`,
      screens ? `- **Preview screens**:\n    ${screens}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return truncate(lines.join("\n\n"));
}

export function formatScreens(screens: ScreenResult[]): string {
  if (screens.length === 0) return "No screens found.";

  const lines = screens.map((s, i) =>
    [
      `### ${i + 1}. ${s.appName} — ${s.screenPatterns.join(", ") || "Screen"}`,
      `- **App**: ${s.appName} (${s.appCategory})`,
      `- **Platform**: ${s.platform}`,
      `- **Patterns**: ${s.screenPatterns.join(", ") || "None"}`,
      `- **Elements**: ${s.screenElements.join(", ") || "None"}`,
      `- **Screen URL**: ${s.screenUrl}`,
      `- **App ID**: ${s.appId}`,
      `- **Screen ID**: ${s.id}`,
      s.metadata ? `- **Dimensions**: ${s.metadata.width}x${s.metadata.height}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatAppPageScreens(screens: AppPageScreen[]): string {
  if (screens.length === 0) return "No screens found for this app.";

  const lines = screens.map((s, i) =>
    [
      `### ${i + 1}. ${s.appName} — ${s.screenPatterns.join(", ") || "Screen"}`,
      `- **App**: ${s.appName} (${s.platform})`,
      `- **Patterns**: ${s.screenPatterns.join(", ") || "None"}`,
      `- **Elements**: ${s.screenElements.join(", ") || "None"}`,
      `- **Screen URL**: ${s.screenUrl}`,
      `- **Screen ID**: ${s.id}`,
      `- **App ID**: ${s.appId}`,
      `- **Dimensions**: ${s.width}x${s.height}`,
      s.isAppKeyScreen ? `- **Key screen**: yes` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatFlows(flows: FlowResult[]): string {
  if (flows.length === 0) return "No flows found.";

  const lines = flows.map((f, i) => {
    const screenList = f.screens
      .slice(0, 5)
      .map((s, j) => {
        const hotspot = s.hotspotX !== null ? " [hotspot]" : "";
        return `  ${j + 1}.${hotspot} ${s.screenUrl}`;
      })
      .join("\n");
    const appInfo = f.appName ? `- **App**: ${f.appName}` : "";
    return [
      `### ${i + 1}. ${f.name}`,
      appInfo,
      `- **Actions**: ${f.actions.join(", ")}`,
      `- **Flow ID**: ${f.id}`,
      `- **Screens** (${f.screens.length} total):`,
      screenList,
      f.screens.length > 5 ? `  ... and ${f.screens.length - 5} more screens` : "",
      f.videoUrl ? `- **Video**: ${f.videoUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return truncate(lines.join("\n\n"));
}

/**
 * Render a heterogenous list of saved-collection items (apps, screens, flows)
 * with a `type` tag on each entry so the agent can disambiguate. Mirrors the
 * field set used by `formatScreens` / `formatFlows` so screen URLs are
 * directly usable downstream (e.g., as input to `mobbin_get_screen_detail`).
 */
export function formatCollectionItems(items: CollectionItem[]): string {
  if (items.length === 0) return "No items in this section.";

  const lines = items.map((item, i) => {
    if (item.contentType === "screens" && item.screen) {
      const s = item.screen;
      return [
        `### ${i + 1}. [screen] ${s.appName} — ${s.screenPatterns.join(", ") || "Screen"}`,
        `- **App**: ${s.appName} (${s.platform})`,
        `- **Patterns**: ${s.screenPatterns.join(", ") || "None"}`,
        `- **Elements**: ${s.screenElements.join(", ") || "None"}`,
        `- **Screen URL**: ${s.screenUrl}`,
        `- **Screen ID**: ${s.id}`,
        `- **App ID**: ${s.appId}`,
        `- **Dimensions**: ${s.width}x${s.height}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (item.contentType === "flows" && item.flow) {
      const f = item.flow;
      const screenList = f.screens
        .slice(0, 5)
        .map((s, j) => {
          const hotspot = s.hotspotX !== null ? " [hotspot]" : "";
          return `  ${j + 1}.${hotspot} ${s.screenUrl}`;
        })
        .join("\n");
      return [
        `### ${i + 1}. [flow] ${f.name} — ${f.appName}`,
        `- **App**: ${f.appName} (${f.platform})`,
        `- **Actions**: ${f.actions.join(", ") || "None"}`,
        `- **Flow ID**: ${f.id}`,
        `- **Screens** (${f.screens.length} total):`,
        screenList,
        f.screens.length > 5 ? `  ... and ${f.screens.length - 5} more screens` : "",
        f.videoUrl ? `- **Video**: ${f.videoUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (item.contentType === "apps" && item.app) {
      const a = item.app;
      return [
        `### ${i + 1}. [app] ${a.appName}`,
        a.appTagline ? `- **Tagline**: ${a.appTagline}` : "",
        `- **Platform**: ${a.platform}`,
        `- **App ID**: ${a.id}`,
        a.appLogoUrl ? `- **Logo**: ${a.appLogoUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    // Fallback for unhandled contentTypes (sites/sections aren't surfaced through
    // the search tools yet, so skip detail rendering and just record the type).
    return `### ${i + 1}. [${item.contentType}] (saved item id: ${item.id})`;
  });

  return truncate(lines.join("\n\n"));
}

export function formatCollections(collections: Collection[]): string {
  if (collections.length === 0) return "No collections found.";

  const lines = collections.map((c, i) =>
    [
      `### ${i + 1}. ${c.name}`,
      c.description ? `- **Description**: ${c.description}` : "",
      `- **ID**: ${c.id}`,
      `- **Mobile**: ${c.mobileAppsCount} apps, ${c.mobileScreensCount} screens, ${c.mobileFlowsCount} flows`,
      `- **Web**: ${c.webAppsCount} apps, ${c.webScreensCount} screens, ${c.webFlowsCount} flows`,
      `- **Public**: ${c.isPublic ? "Yes" : "No"}`,
      `- **Updated**: ${c.updatedAt}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return truncate(lines.join("\n\n"));
}

export function formatScreenDetail(params: {
  screenUrl: string;
  screenId?: string;
  appName?: string;
  screenPatterns?: string[];
  screenElements?: string[];
  dimensions?: { width: number; height: number };
  imageSizeBytes: number;
  mimeType: string;
  dominantColors?: string[];
}): string {
  const lines: string[] = [];

  lines.push(`## Screen Detail`);

  if (params.appName) {
    lines.push(`- **App**: ${params.appName}`);
  }
  if (params.screenId) {
    lines.push(`- **Screen ID**: ${params.screenId}`);
  }
  if (params.screenPatterns && params.screenPatterns.length > 0) {
    lines.push(`- **Patterns**: ${params.screenPatterns.join(", ")}`);
  }
  if (params.screenElements && params.screenElements.length > 0) {
    lines.push(`- **Elements**: ${params.screenElements.join(", ")}`);
  }
  if (params.dimensions) {
    lines.push(`- **Dimensions**: ${params.dimensions.width}x${params.dimensions.height}`);
  }
  if (params.dominantColors && params.dominantColors.length > 0) {
    lines.push(`- **Dominant Colors**: ${params.dominantColors.join(", ")}`);
  }
  lines.push(`- **Image format**: ${params.mimeType}`);
  lines.push(`- **Image size**: ${(params.imageSizeBytes / 1024).toFixed(1)} KB`);
  lines.push(`- **Source URL**: ${params.screenUrl}`);

  return lines.join("\n");
}

type ContentCounts =
  DictionaryCategory["subCategories"][number]["entries"][number]["contentCounts"];

// Three shapes in the wild: { type: { platform: count } }, { type: count }, or null.
// Originally proven inline by commit 23592d2; extracted so formatFilterFacet can reuse.
export function formatContentCounts(counts: ContentCounts): string {
  return Object.entries(counts ?? {})
    .flatMap(([type, platforms]) => {
      if (platforms && typeof platforms === "object") {
        return Object.entries(platforms).map(([p, c]) => `${p} ${type}: ${c}`);
      }
      if (typeof platforms === "number") {
        return [`${type}: ${platforms}`];
      }
      return [];
    })
    .join(", ");
}

export function formatFilterFacet(
  categories: DictionaryCategory[],
  opts: { includeDefinitions: boolean; includeCounts: boolean },
): string {
  const entries = categories
    .flatMap((cat) => cat.subCategories ?? [])
    .flatMap((sub) => sub.entries ?? [])
    .filter((e) => !e.hidden);

  if (entries.length === 0) return "No filter values found.";

  if (!opts.includeDefinitions && !opts.includeCounts) {
    return truncate(entries.map((e) => e.displayName).join("\n"));
  }

  const text = entries
    .map((e) => {
      const parts = [`- **${e.displayName}**`];
      if (opts.includeDefinitions && e.definition) parts.push(e.definition);
      if (opts.includeCounts) {
        const counts = formatContentCounts(e.contentCounts);
        if (counts) parts.push(`(${counts})`);
      }
      return parts.join(" — ");
    })
    .join("\n");
  return truncate(text);
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.substring(0, CHARACTER_LIMIT) +
    "\n\n---\n*Response truncated. Use pagination to see more results.*"
  );
}
