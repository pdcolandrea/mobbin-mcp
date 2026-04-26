/** A single screen thumbnail used in app previews and collections. */
export interface PreviewScreen {
  id: string;
  /** Public Supabase storage URL for the screen image (no auth required). */
  screenUrl: string;
  /** True if uploaded by the user rather than curated by Mobbin. */
  isUserScreen?: boolean;
}

/**
 * Lightweight app record returned by the `/api/searchable-apps/{platform}` endpoint.
 * Used for client-side autocomplete — the full list is cached per platform.
 */
export interface SearchableApp {
  id: string;
  platform: string;
  appName: string;
  appLogoUrl: string;
  appTagline: string;
  /** Search keywords associated with this app (e.g., "streaming", "fitness"). */
  keywords: string[];
  previewScreens: PreviewScreen[];
}

/**
 * Full app record returned by `/api/content/search-apps`.
 * Contains version info, metrics, and preview data.
 */
export interface AppResult {
  id: string;
  appName: string;
  /** Primary category (e.g., "Finance", "Music & Audio"). */
  appCategory: string;
  /** All categories including secondary ones. */
  allAppCategories: string[];
  appLogoUrl: string;
  appTagline: string;
  /** "ios" | "android" | "web" */
  platform: string;
  keywords: string[];
  /** Use this ID to construct app detail URLs or fetch screens/flows. */
  appVersionId: string;
  appVersionPublishedAt: string;
  previewScreens: PreviewScreen[];
  /** Bytescale CDN URL for the app's preview video, if available. */
  previewVideoUrl: string | null;
  /** All-time popularity score — higher means more viewed. */
  popularityMetric: number;
  /** Recent trending score — higher means currently popular. */
  trendingMetric: number;
  /** True if the app requires a paid Mobbin plan to view in full. */
  isRestricted: boolean;
}

/**
 * Screen record returned by `/api/content/search-screens`.
 * Includes the parent app context so screens can be attributed.
 */
export interface ScreenResult {
  /** "curated" for Mobbin-captured screens. */
  type: string;
  id: string;
  /** Public Supabase storage URL for the full-resolution screenshot. */
  screenUrl: string;
  /** Full-page screenshot URL if the screen extends beyond the viewport. */
  fullpageScreenUrl: string | null;
  /** Position of this screen within its app version. */
  screenNumber: number;
  /** UI patterns detected (e.g., "Login", "Checkout", "Profile"). */
  screenPatterns: string[];
  /** UI elements detected (e.g., "Card", "Table", "Dropdown Menu"). */
  screenElements: string[];
  /** OCR-extracted text content from the screenshot. */
  screenKeywords: string;
  appVersionId: string;
  appId: string;
  appName: string;
  appCategory: string;
  allAppCategories: string[];
  appLogoUrl: string;
  appTagline: string;
  companyHqRegion: string | null;
  companyStage: string | null;
  platform: string;
  popularityMetric: number;
  trendingMetric: number;
  /** Original screenshot dimensions in pixels. */
  metadata: { width: number; height: number };
  /** Optimized image via Bytescale CDN (smaller, faster to load). */
  screenCdnImgSources?: { src: string };
}

/**
 * A single screen within a user flow, including interactive hotspot data.
 * Hotspot coordinates are normalized (0-1) relative to the screen dimensions.
 */
export interface FlowScreen {
  id: string;
  /** Position in the flow sequence (0-indexed). */
  order: number;
  hotspotType: string | null;
  /** Normalized X position of the tap target (0 = left, 1 = right). */
  hotspotX: number | null;
  /** Normalized Y position of the tap target (0 = top, 1 = bottom). */
  hotspotY: number | null;
  /** Normalized width of the tap target. */
  hotspotWidth: number | null;
  /** Normalized height of the tap target. */
  hotspotHeight: number | null;
  /** Timestamp in the flow video where this screen appears. */
  videoTimestamp: number | null;
  screenUrl: string;
  /** References the parent screen record by ID. */
  screenId: string;
  screenElements: string[];
  screenPatterns: string[];
  metadata: { width: number; height: number };
}

/**
 * A user flow (journey) returned by `/api/content/search-flows`.
 * Contains an ordered sequence of screens with hotspot navigation data.
 */
export interface FlowResult {
  id: string;
  /** Human-readable flow name (e.g., "Onboarding", "Checkout"). */
  name: string;
  /** Actions performed in this flow (e.g., "Creating Account", "Verifying"). */
  actions: string[];
  order: number;
  /** Bytescale CDN URL for the flow video recording, if available. */
  videoUrl: string | null;
  /** Ordered list of screens in this flow. */
  screens: FlowScreen[];
  /** Present when searching flows across apps (not when viewing a single app's flows). */
  appVersionId?: string;
  appId?: string;
  appName?: string;
  appCategory?: string;
  appLogoUrl?: string;
  platform?: string;
}

/** A user-created collection of saved apps, screens, and flows. */
export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  /** User UUID who created this collection. */
  createdBy: string;
  mobileAppsCount: number;
  mobileScreensCount: number;
  mobileFlowsCount: number;
  webAppsCount: number;
  webScreensCount: number;
  webFlowsCount: number;
  /** Up to 3 preview screens from the collection. */
  mobilePreviewScreens: PreviewScreen[];
}

/** Pagination params used by all `/api/content/search-*` endpoints. */
export interface PaginationOptions {
  pageSize: number;
  /** 0-indexed page number. */
  pageIndex: number;
  /** "trending" | "publishedAt" | "popular" | "top" */
  sortBy: string;
}

/** Standard response wrapper for paginated content search endpoints. */
export interface ContentSearchResponse<T> {
  value: {
    searchRequestId: string;
    data: T[];
  };
}

/** Standard response wrapper for non-paginated endpoints. */
export interface ValueResponse<T> {
  value: T;
}

/** A filter category returned by `/api/filter-tags/fetch-dictionary-definitions`. */
export interface DictionaryCategory {
  slug: string;
  displayName: string;
  experience: string;
  subCategories: Array<{
    entries: Array<{
      displayName: string;
      definition: string;
      hidden?: boolean;
      contentCounts: Record<string, Record<string, number> | number> | null;
    }>;
  }>;
}
