/**
 * Utility functions for formatting various Mobbin data structures into human‑readable Markdown strings.
 *
 * The functions below are used by the CLI and the Copilot tools to present API results.
 * They all honour the global {@link CHARACTER_LIMIT} constant and truncate output when
 * necessary via the internal {@link truncate} helper.
 */

import { CHARACTER_LIMIT } from "../constants.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  DictionaryCategory,
  AppPageScreen,
} from "../types.js";

/**
 * Format a list of app search results.
 *
 * Each app is rendered as a Markdown section containing its name, tagline, categories,
 * platform, identifiers, popularity metrics and a preview of up to two screen URLs.
 *
 * @param apps - Array of {@link AppResult} objects returned by the API.
 * @returns A formatted string suitable for display in a CLI or GPT response.
 */
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

/**
 * Format a list of screen results.
 *
 * Includes basic app information, platform, patterns, elements, the screen URL and
 * optionally the extracted image dimensions.
 *
 * @param screens - Array of {@link ScreenResult} objects.
 * @returns Markdown representation of the screens.
 */
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

/**
 * Format a list of screens that belong to a specific app page.
 *
 * Mirrors {@link formatScreens} but adds the {@link AppPageScreen} specific fields
 * such as explicit width/height and a flag indicating whether the screen is a key
 * screen for the app.
 *
 * @param screens - Array of {@link AppPageScreen} objects.
 * @returns Formatted Markdown string.
 */
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

/**
 * Format a list of user‑created flows.
 *
 * Each flow shows its name, the associated app (if any), actions, screens (up to five
 * with hotspot indication) and an optional video URL.
 *
 * @param flows - Array of {@link FlowResult} objects.
 * @returns Markdown describing the flows.
 */
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
 * Format a list of collections.
 *
 * Provides a high‑level overview of each collection including counts of apps, screens
 * and flows for both mobile and web platforms, visibility and last update timestamp.
 *
 * @param collections - Array of {@link Collection} objects.
 * @returns Formatted Markdown for the collections.
 */
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

/**
 * Format the detailed view of a single screen.
 *
 * The function receives a rich parameter object – only the fields that are present
 * are rendered.  Dimensions, dominant colours and other optional metadata are added
 * when available.
 *
 * @param params - Object containing screen metadata.
 * @returns A Markdown block describing the screen.
 */
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

/**
 * Helper to render the rarely‑used {@link ContentCounts} structure.
 *
 * The structure can appear in three shapes – a map of platform → count, a direct
 * count, or be null.  This function normalises those shapes into a comma‑separated
 * string.
 *
 * @param counts - The raw {@link ContentCounts} object.
 * @returns Human readable string.
 */
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

/**
 * Render a list of dictionary categories as filter facets.
 *
 * Depending on the options, the output can include definitions, content counts or
 * both.  Hidden entries are excluded.
 *
 * @param categories - Array of {@link DictionaryCategory} objects.
 * @param opts - Rendering options.
 * @returns Truncated Markdown list.
 */
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

/**
 * Truncate a string to the global {@link CHARACTER_LIMIT}.
 *
 * If the text exceeds the limit a truncation notice is appended.
 *
 * @param text - The text to potentially truncate.
 * @returns Either the original text or the truncated version.
 */
function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.substring(0, CHARACTER_LIMIT) +
    "\n\n---\n*Response truncated. Use pagination to see more results.*"
  );
}
