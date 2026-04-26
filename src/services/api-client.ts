import sharp from "sharp";
import { z } from "zod";
import {
  MOBBIN_BASE_URL,
  ALLOWED_IMAGE_HOSTS,
  MAX_IMAGE_SIZE_BYTES,
  IMAGE_FETCH_TIMEOUT_MS,
  BYTESCALE_CDN_BASE,
  SUPABASE_STORAGE_PREFIX,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_INDEX,
  COLOR_SAMPLE_SIZE,
  COLOR_QUANTIZE_STEP,
  COLOR_QUANTIZE_MAX,
} from "../constants.js";
import {
  searchAppsResponseSchema,
  searchScreensResponseSchema,
  searchFlowsResponseSchema,
  autocompleteResponseSchema,
  searchableAppsResponseSchema,
  popularAppsResponseSchema,
  collectionsResponseSchema,
  dictionaryDefinitionsResponseSchema,
  appPagePayloadSchema,
  appPageScreenSchema,
  flowResultSchema,
} from "./schemas.js";
import type { MobbinAuth } from "./auth.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  SearchableApp,
  PopularAppEntry,
  AutocompleteResponse,
  DictionaryCategory,
  ContentSearchResponse,
  ValueResponse,
  AppPageScreen,
} from "../types.js";

/**
 * HTTP client for Mobbin's internal Next.js API routes.
 *
 * Mobbin has no public API — these endpoints were reverse-engineered via Playwright.
 * Auth is handled via {@link MobbinAuth}, which manages the Supabase session cookie
 * and automatically refreshes tokens before they expire.
 *
 * All endpoints live at `https://mobbin.com/api/...` and proxy to Supabase server-side.
 */
export class MobbinApiClient {
  private auth: MobbinAuth;

  constructor(auth: MobbinAuth) {
    this.auth = auth;
  }

  /**
   * Make an authenticated request to a Mobbin API route and validate the response against a zod schema.
   *
   * On validation failure the thrown error names the request path AND each failing field
   * (e.g. `value.data[0].screenPatterns: Required`) so shape drift surfaces at the boundary
   * instead of crashing several layers later in a formatter.
   */
  private async request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    options: { method?: string; body?: unknown } = {},
  ): Promise<z.infer<S>> {
    const { method = "GET", body } = options;
    const cookie = await this.auth.getCookieValue();

    const headers: Record<string, string> = {
      Cookie: cookie,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Mobbin API error: ${res.status} ${res.statusText} - ${path}${text ? `: ${text.substring(0, 200)}` : ""}`,
      );
    }

    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => {
          const issuePath = issue.path.length ? issue.path.join(".") : "(root)";
          return `  ${issuePath}: ${issue.message}`;
        })
        .join("\n");
      throw new Error(`Mobbin API response failed validation for ${path}:\n${issues}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  /**
   * Search and browse apps with category filtering and pagination.
   * Endpoint: `POST /api/content/search-apps`
   */
  async searchApps(params: {
    platform: string;
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<AppResult>> {
    return this.request("/api/content/search-apps", searchAppsResponseSchema, {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          appCategories: params.appCategories ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
          pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
          sortBy: params.sortBy ?? "publishedAt",
        },
      },
    });
  }

  /**
   * Search screens across all apps by patterns, elements, or OCR keywords.
   * Endpoint: `POST /api/content/search-screens`
   */
  async searchScreens(params: {
    platform: string;
    screenPatterns?: string[];
    screenElements?: string[];
    screenKeywords?: string[];
    appCategories?: string[];
    hasAnimation?: boolean;
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<ScreenResult>> {
    return this.request("/api/content/search-screens", searchScreensResponseSchema, {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          screenPatterns: params.screenPatterns ?? null,
          screenElements: params.screenElements ?? null,
          screenKeywords: params.screenKeywords ?? null,
          appCategories: params.appCategories ?? null,
          hasAnimation: params.hasAnimation ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
          pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
          sortBy: params.sortBy ?? "trending",
        },
      },
    });
  }

  /**
   * Search user flows/journeys by action type (e.g., "Creating Account").
   * Endpoint: `POST /api/content/search-flows`
   */
  async searchFlows(params: {
    platform: string;
    flowActions?: string[];
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<FlowResult>> {
    return this.request("/api/content/search-flows", searchFlowsResponseSchema, {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          flowActions: params.flowActions ?? null,
          appCategories: params.appCategories ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
          pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
          sortBy: params.sortBy ?? "trending",
        },
      },
    });
  }

  /**
   * Fast autocomplete search — returns matching IDs grouped by relevance.
   * Results contain only IDs; cross-reference with {@link getSearchableApps} for full details.
   * Endpoint: `POST /api/search-bar/search`
   */
  async autocompleteSearch(params: {
    query: string;
    experience?: string;
    platform?: string;
  }): Promise<AutocompleteResponse> {
    return this.request("/api/search-bar/search", autocompleteResponseSchema, {
      method: "POST",
      body: {
        query: params.query,
        experience: params.experience ?? "apps",
        platform: params.platform ?? "ios",
      },
    });
  }

  /**
   * Fetch the full list of apps for a platform (used for autocomplete cross-referencing).
   * This is a large response (~1000+ apps); results are cached by the Mobbin client.
   * Endpoint: `GET /api/searchable-apps/{platform}`
   */
  async getSearchableApps(platform: string): Promise<SearchableApp[]> {
    return this.request(`/api/searchable-apps/${platform}`, searchableAppsResponseSchema);
  }

  /**
   * Get popular apps grouped by category with preview screenshots.
   * Endpoint: `POST /api/popular-apps/fetch-popular-apps-with-preview-screens`
   */
  async getPopularApps(params: {
    platform: string;
    limitPerCategory?: number;
  }): Promise<ValueResponse<PopularAppEntry[]>> {
    return this.request(
      "/api/popular-apps/fetch-popular-apps-with-preview-screens",
      popularAppsResponseSchema,
      {
        method: "POST",
        body: {
          platform: params.platform,
          limitPerCategory: params.limitPerCategory ?? 10,
        },
      },
    );
  }

  /**
   * Fetch the authenticated user's saved collections with item counts.
   * Endpoint: `POST /api/collection/fetch-collections`
   */
  async getCollections(): Promise<ValueResponse<Collection[]>> {
    return this.request("/api/collection/fetch-collections", collectionsResponseSchema, {
      method: "POST",
    });
  }

  /**
   * Fetch the full filter taxonomy — all app categories, screen patterns,
   * UI elements, and flow actions with definitions and content counts.
   * Endpoint: `POST /api/filter-tags/fetch-dictionary-definitions`
   */
  async getDictionaryDefinitions(): Promise<ValueResponse<DictionaryCategory[]>> {
    return this.request(
      "/api/filter-tags/fetch-dictionary-definitions",
      dictionaryDefinitionsResponseSchema,
      {
        method: "POST",
        body: {},
      },
    );
  }

  /**
   * Fetch the SSR'd app-detail page for an app and return its embedded
   * flows + screens. Mobbin's `/api/content/search-screens` and
   * `/api/content/search-flows` ignore per-app filters silently — confirmed
   * via probe — so the only authoritative per-app source is the HTML page
   * at `/apps/{slug}-{platform}-{appId}/screens`. The page renders via
   * Next.js Server Components and inlines the structured data inside
   * `self.__next_f.push([1, "..."])` flight chunks; we concatenate the
   * chunks, locate the `[{"value":[...]}, ...]` payload, and parse it.
   *
   * Slug derivation: looked up via `getSearchableApps`, kebab-cased.
   * AppVersionId is NOT required — Mobbin redirects to the latest version.
   *
   * Endpoint: `GET /apps/{slug}-{platform}-{appId}/screens`
   */
  async getAppPage(params: {
    appId: string;
    platform: string;
  }): Promise<{ flows: FlowResult[]; screens: AppPageScreen[]; appName: string; slug: string }> {
    const allApps = await this.getSearchableApps(params.platform);
    const app = allApps.find((a) => a.id === params.appId);
    if (!app) {
      throw new Error(
        `App not found: appId=${params.appId} platform=${params.platform}. Use mobbin_quick_search to discover valid app IDs.`,
      );
    }
    const slug = `${slugifyAppName(app.appName)}-${params.platform}-${params.appId}`;
    const path = `/apps/${slug}/screens`;

    const cookie = await this.auth.getCookieValue();
    const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
      headers: {
        Cookie: cookie,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Mobbin app page fetch failed: ${res.status} ${res.statusText} - ${path}`);
    }
    const html = await res.text();

    const payload = extractAppPagePayload(html, path);
    const flows = z.array(flowResultSchema).parse(payload[0].value);
    const screens = z.array(appPageScreenSchema).parse(payload[1].value);
    return { flows, screens, appName: app.appName, slug };
  }

  /**
   * Convert a Supabase storage URL to its Bytescale CDN equivalent.
   * Supabase storage URLs are not directly accessible — images are served via CDN.
   *
   * Input:  https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png
   * Output: https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/content/app_screens/{uuid}.png?f=webp&w=1920&q=85&fit=shrink-cover
   */
  private toCdnUrl(imageUrl: string): string {
    const parsed = new URL(imageUrl);

    // Already a CDN URL — use as-is
    if (parsed.hostname === "bytescale.mobbin.com") {
      return imageUrl;
    }

    // Convert Supabase storage URL to CDN URL
    const storageIdx = parsed.pathname.indexOf(SUPABASE_STORAGE_PREFIX);
    if (storageIdx === -1) {
      throw new Error(`Unrecognized Supabase URL format: ${imageUrl}`);
    }

    const storagePath = parsed.pathname.slice(storageIdx + SUPABASE_STORAGE_PREFIX.length);
    return `${BYTESCALE_CDN_BASE}/${storagePath}?f=webp&w=1920&q=85&fit=shrink-cover`;
  }

  /**
   * Fetch a screen image from its URL and return it as base64.
   * Automatically converts Supabase storage URLs to Bytescale CDN URLs.
   * No authentication required — these are public CDN assets.
   */
  async fetchScreenImage(imageUrl: string): Promise<{
    base64: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
  }> {
    const parsed = new URL(imageUrl);
    if (!ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) {
      throw new Error(
        `Untrusted image host: ${parsed.hostname}. Only Supabase storage and Bytescale CDN URLs are supported.`,
      );
    }

    const fetchUrl = this.toCdnUrl(imageUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(fetchUrl, { signal: controller.signal });

      if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.status} ${res.statusText} — ${fetchUrl}`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image too large (${contentLength} bytes). Max: ${MAX_IMAGE_SIZE_BYTES} bytes.`,
        );
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image too large (${buffer.byteLength} bytes). Max: ${MAX_IMAGE_SIZE_BYTES} bytes.`,
        );
      }

      let mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
      if (!mimeType || mimeType === "application/octet-stream") {
        if (fetchUrl.includes("f=webp")) mimeType = "image/webp";
        else if (fetchUrl.endsWith(".png")) mimeType = "image/png";
        else if (fetchUrl.endsWith(".jpg") || fetchUrl.endsWith(".jpeg")) mimeType = "image/jpeg";
        else mimeType = "image/png";
      }

      const base64 = Buffer.from(buffer).toString("base64");
      return {
        base64,
        mimeType,
        sizeBytes: buffer.byteLength,
        buffer: Buffer.from(buffer),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract dominant colors from a screen image buffer.
   * Returns an array of hex color strings sorted by frequency.
   */
  async extractColors(imageBuffer: Buffer, maxColors: number = 8): Promise<string[]> {
    // Resize to small thumbnail for faster color sampling
    const { data } = await sharp(imageBuffer)
      .resize(COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Count pixel colors, quantized to reduce noise (round to nearest step)
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.min(
        Math.round(data[i] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const g = Math.min(
        Math.round(data[i + 1] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const b = Math.min(
        Math.round(data[i + 2] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    // Sort by frequency and return top colors
    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([hex]) => hex);
  }
}

/**
 * Mobbin's app slug is `<lowercase-kebab-app-name>-<platform>-<appId>`.
 * Mobbin's slugifier strips ASCII punctuation and collapses whitespace runs to a single dash.
 * "Linear Mobile" → "linear-mobile", "ChatGPT (AI)" → "chatgpt-ai".
 */
function slugifyAppName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract the structured payload (`[{value: flows}, {value: screens}, {value: meta}]`)
 * from Mobbin's SSR'd app-detail HTML. The page streams data via
 * `self.__next_f.push([1, "<chunk>"])` calls; concatenating the chunks gives
 * the React Flight stream, which contains the JSON payload as a substring
 * starting with `[{"value":[`. We locate that, walk forward with
 * bracket/quote tracking, and JSON.parse the slice.
 *
 * Path is passed in for error attribution.
 */
function extractAppPagePayload(html: string, path: string): z.infer<typeof appPagePayloadSchema> {
  const chunkRe = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g;
  let stream = "";
  let m: RegExpExecArray | null;
  while ((m = chunkRe.exec(html)) !== null) {
    try {
      stream += JSON.parse(`"${m[1]}"`) as string;
    } catch {
      // Skip malformed chunks — partial streams happen near end-of-document.
    }
  }

  const start = stream.indexOf('[{"value":[');
  if (start < 0) {
    throw new Error(
      `Could not locate app-page payload in ${path}. Mobbin may have changed its SSR format, or the slug resolved to a 404 page.`,
    );
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = start;
  for (; end < stream.length; end++) {
    const c = stream[end];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stream.slice(start, end));
  } catch (err) {
    throw new Error(
      `Failed to parse app-page payload JSON in ${path}: ${(err as Error).message.slice(0, 200)}`,
      { cause: err },
    );
  }
  return appPagePayloadSchema.parse(parsed);
}
