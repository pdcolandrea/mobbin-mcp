import { MOBBIN_BASE_URL } from "../constants";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  SearchableApp,
  ContentSearchResponse,
  ValueResponse,
} from "../types";
import type { MobbinAuth } from "./auth";

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

  /** Make an authenticated request to a Mobbin API route. Automatically uses a fresh token. */
  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
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
        `Mobbin API error: ${res.status} ${res.statusText} - ${path}${text ? `: ${text.substring(0, 200)}` : ""}`
      );
    }

    return res.json() as Promise<T>;
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
    return this.request("/api/content/search-apps", {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          appCategories: params.appCategories ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? 24,
          pageIndex: params.pageIndex ?? 0,
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
    return this.request("/api/content/search-screens", {
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
          pageSize: params.pageSize ?? 24,
          pageIndex: params.pageIndex ?? 0,
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
    return this.request("/api/content/search-flows", {
      method: "POST",
      body: {
        searchRequestId: "",
        filterOptions: {
          platform: params.platform,
          flowActions: params.flowActions ?? null,
          appCategories: params.appCategories ?? null,
        },
        paginationOptions: {
          pageSize: params.pageSize ?? 24,
          pageIndex: params.pageIndex ?? 0,
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
  }): Promise<{
    value: {
      experience: string;
      primary: Array<{ id: string; type: string }>;
      other: Array<{ id: string; type: string }>;
      secondaryPlatform: Array<{ id: string; type: string }>;
      sites: Array<{ id: string; type: string }>;
    };
  }> {
    return this.request("/api/search-bar/search", {
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
  async getSearchableApps(
    platform: string
  ): Promise<SearchableApp[]> {
    return this.request(`/api/searchable-apps/${platform}`);
  }

  /**
   * Get popular apps grouped by category with preview screenshots.
   * Endpoint: `POST /api/popular-apps/fetch-popular-apps-with-preview-screens`
   */
  async getPopularApps(params: {
    platform: string;
    limitPerCategory?: number;
  }): Promise<ValueResponse<Array<{
    app_id: string;
    app_name: string;
    app_logo_url: string;
    preview_screens: Array<{ id: string; screenUrl: string }>;
    app_category: string;
    secondary_app_categories: string[];
    popularity_metric: number;
  }>>> {
    return this.request("/api/popular-apps/fetch-popular-apps-with-preview-screens", {
      method: "POST",
      body: {
        platform: params.platform,
        limitPerCategory: params.limitPerCategory ?? 10,
      },
    });
  }

  /**
   * Fetch the authenticated user's saved collections with item counts.
   * Endpoint: `POST /api/collection/fetch-collections`
   */
  async getCollections(): Promise<ValueResponse<Collection[]>> {
    return this.request("/api/collection/fetch-collections", {
      method: "POST",
    });
  }

  /**
   * Fetch the full filter taxonomy — all app categories, screen patterns,
   * UI elements, and flow actions with definitions and content counts.
   * Endpoint: `POST /api/filter-tags/fetch-dictionary-definitions`
   */
  async getDictionaryDefinitions(): Promise<ValueResponse<unknown>> {
    return this.request("/api/filter-tags/fetch-dictionary-definitions", {
      method: "POST",
      body: {},
    });
  }
}
