import { z } from "zod";

/**
 * Zod schemas for Mobbin API responses.
 *
 * These are the runtime contract enforced at the API boundary in `MobbinApiClient.request`.
 * Types in `src/types.ts` are derived from these via `z.infer`, so schema and type cannot drift.
 *
 * All object schemas use `.passthrough()` — we assert only on the fields we consume,
 * so Mobbin can add new fields without breaking the client.
 */

export const previewScreenSchema = z
  .object({
    id: z.string(),
    screenUrl: z.string(),
    isUserScreen: z.boolean().optional(),
  })
  .passthrough();

export const searchableAppSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    appName: z.string(),
    appLogoUrl: z.string(),
    appTagline: z.string(),
    keywords: z.array(z.string()),
    previewScreens: z.array(previewScreenSchema).nullable(),
  })
  .passthrough();

export const appResultSchema = z
  .object({
    id: z.string(),
    appName: z.string(),
    appCategory: z.string(),
    allAppCategories: z.array(z.string()),
    appLogoUrl: z.string(),
    appTagline: z.string(),
    platform: z.string(),
    keywords: z.array(z.string()),
    appVersionId: z.string(),
    appVersionPublishedAt: z.string(),
    previewScreens: z.array(previewScreenSchema),
    previewVideoUrl: z.string().nullable(),
    popularityMetric: z.number(),
    trendingMetric: z.number(),
    isRestricted: z.boolean(),
  })
  .passthrough();

export const screenResultSchema = z
  .object({
    type: z.string(),
    id: z.string(),
    screenUrl: z.string(),
    fullpageScreenUrl: z.string().nullable(),
    screenNumber: z.number(),
    screenPatterns: z.array(z.string()),
    screenElements: z.array(z.string()),
    screenKeywords: z.string(),
    appVersionId: z.string(),
    appId: z.string(),
    appName: z.string(),
    appCategory: z.string(),
    allAppCategories: z.array(z.string()),
    appLogoUrl: z.string(),
    appTagline: z.string(),
    companyHqRegion: z.string().nullable(),
    companyStage: z.string().nullable(),
    platform: z.string(),
    popularityMetric: z.number(),
    trendingMetric: z.number(),
    metadata: z.object({ width: z.number(), height: z.number() }).passthrough(),
    screenCdnImgSources: z.object({ src: z.string() }).passthrough().optional(),
  })
  .passthrough();

/**
 * Actual shape returned by `/api/content/search-flows` — confirmed via the probe in
 * commit 439d3d7. The interface previously declared `screenPatterns` and `metadata`,
 * which the API never sends; that mismatch is exactly what this validation prevents.
 */
export const flowScreenSchema = z
  .object({
    order: z.number(),
    hotspotType: z.string().nullable(),
    hotspotX: z.number().nullable(),
    hotspotY: z.number().nullable(),
    hotspotWidth: z.number().nullable(),
    hotspotHeight: z.number().nullable(),
    videoTimestamp: z.number().nullable(),
    screenUrl: z.string(),
    screenId: z.string(),
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

export const flowResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    actions: z.array(z.string()),
    videoUrl: z.string().nullable(),
    screens: z.array(flowScreenSchema),
    appVersionId: z.string().optional(),
    appId: z.string().optional(),
    appName: z.string().optional(),
    appCategory: z.string().optional(),
    appLogoUrl: z.string().optional(),
    platform: z.string().optional(),
  })
  .passthrough();

export const collectionSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    description: z.string(),
    isPublic: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    createdBy: z.string(),
    mobileAppsCount: z.number(),
    mobileScreensCount: z.number(),
    mobileFlowsCount: z.number(),
    webAppsCount: z.number(),
    webScreensCount: z.number(),
    webFlowsCount: z.number(),
    mobilePreviewScreens: z.array(previewScreenSchema).optional(),
  })
  .passthrough();

/**
 * Item shape returned by `/collections/api/fetch-collection-contents`.
 *
 * The envelope is the same for every contentType — what varies is which inner
 * payload key is populated (`screen`, `flow`, `app`, etc.) and which FK column
 * is non-null (`app_screen_id`, `app_flow_id`, ...). The inner payloads are
 * close to the search-API shapes but trimmed differently (for example, the
 * `screen` payload exposes top-level `width`/`height` instead of `metadata`,
 * and lacks `appCategory`/`popularityMetric`/`screenNumber`), so we keep them
 * as `unknown()` and validate just the fields the formatter consumes.
 */
export const collectionItemScreenSchema = z
  .object({
    id: z.string(),
    appId: z.string(),
    appName: z.string(),
    platform: z.string(),
    screenUrl: z.string(),
    width: z.number(),
    height: z.number(),
    screenPatterns: z.array(z.string()),
    screenElements: z.array(z.string()),
    appLogoUrl: z.string().optional(),
    fullpageScreenUrl: z.string().nullable().optional(),
  })
  .passthrough();

export const collectionItemFlowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    appId: z.string(),
    appName: z.string(),
    platform: z.string(),
    actions: z.array(z.string()),
    videoUrl: z.string().nullable(),
    screens: z.array(flowScreenSchema),
  })
  .passthrough();

export const collectionItemAppSchema = z
  .object({
    id: z.string(),
    appName: z.string(),
    platform: z.string(),
    appLogoUrl: z.string().optional(),
    appTagline: z.string().optional(),
  })
  .passthrough();

export const collectionItemSchema = z
  .object({
    id: z.string(),
    collection_id: z.string(),
    contentType: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    app_id: z.string().nullable(),
    app_screen_id: z.string().nullable(),
    app_flow_id: z.string().nullable(),
    site_id: z.string().nullable(),
    site_page_section_id: z.string().nullable(),
    screen: collectionItemScreenSchema.optional(),
    flow: collectionItemFlowSchema.optional(),
    app: collectionItemAppSchema.optional(),
  })
  .passthrough();

/**
 * Successful response from `/collections/api/fetch-collection-contents`.
 *
 * The endpoint also returns HTTP 200 with `{ error: { message, code } }` for
 * server-side failures (e.g., unknown `collectionId` -> "query error"). Those
 * are turned into thrown errors by the API client so they surface at the call
 * site instead of silently parsing as an empty result.
 */
export const collectionContentsResponseSchema = z
  .object({
    value: z
      .object({
        data: z.array(collectionItemSchema),
        pageSize: z.number().optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({
        message: z.string(),
        code: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const dictionaryCategorySchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    experience: z.string(),
    subCategories: z.array(
      z
        .object({
          entries: z.array(
            z
              .object({
                displayName: z.string(),
                definition: z.string(),
                hidden: z.boolean().optional(),
                contentCounts: z.record(z.union([z.record(z.number()), z.number()])).nullable(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const popularAppEntrySchema = z
  .object({
    app_id: z.string(),
    app_name: z.string(),
    app_logo_url: z.string(),
    preview_screens: z.array(z.object({ id: z.string(), screenUrl: z.string() }).passthrough()),
    app_category: z.string(),
    secondary_app_categories: z.array(z.string()),
    popularity_metric: z.number(),
  })
  .passthrough();

const autocompleteItemSchema = z.object({ id: z.string(), type: z.string() }).passthrough();

export const autocompleteResponseSchema = z
  .object({
    value: z
      .object({
        experience: z.string(),
        primary: z.array(autocompleteItemSchema),
        other: z.array(autocompleteItemSchema),
        secondaryPlatform: z.array(autocompleteItemSchema),
        sites: z.array(autocompleteItemSchema),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Screens as embedded in the SSR'd app-detail page (`/apps/{slug}/screens`).
 * Shape differs from `screenResultSchema` (the search-screens API): SSR carries
 * extras like OCR boxes and `isAppKeyScreen`, but lacks `screenNumber`,
 * `appCategory`, `popularityMetric`, etc. Used by `getAppPage`.
 */
export const ocrBoundingBoxSchema = z
  .object({
    text: z.string(),
    bbox: z
      .object({
        x0: z.number(),
        y0: z.number(),
        x1: z.number(),
        y1: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

export const appPageScreenSchema = z
  .object({
    type: z.string(),
    id: z.string(),
    screenUrl: z.string(),
    createdAt: z.string(),
    width: z.number(),
    height: z.number(),
    fullpageScreenUrl: z.string().nullable(),
    screenElements: z.array(z.string()),
    screenPatterns: z.array(z.string()),
    isAppKeyScreen: z.boolean(),
    appId: z.string(),
    appName: z.string(),
    appLogoUrl: z.string(),
    platform: z.string(),
    appVersionId: z.string(),
    appVersionPublishedAt: z.string(),
    ocrBoundingBoxes: z.array(ocrBoundingBoxSchema).nullable().optional(),
  })
  .passthrough();

/**
 * Top-level shape of the structured payload extracted from the SSR HTML —
 * an array where `[0].value` is flows and `[1].value` is the flat screens list.
 * `[2]` (and beyond) is dictionary metadata we ignore. Validate the inner
 * arrays with their own schemas in code rather than locking the tuple length.
 */
export const appPagePayloadEntrySchema = z.object({ value: z.unknown() }).passthrough();

export const appPagePayloadSchema = z.array(appPagePayloadEntrySchema).min(2);

/** Wraps an item schema in the standard paginated `{ value: { searchRequestId, data: T[] } }` envelope. */
export const contentSearchResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      value: z
        .object({
          searchRequestId: z.string(),
          data: z.array(item),
        })
        .passthrough(),
    })
    .passthrough();

/** Wraps a data schema in the standard non-paginated `{ value: T }` envelope. */
export const valueResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ value: data }).passthrough();

// Pre-composed response schemas — these are what `MobbinApiClient` methods pass to `request()`.
export const searchAppsResponseSchema = contentSearchResponseSchema(appResultSchema);
export const searchScreensResponseSchema = contentSearchResponseSchema(screenResultSchema);
export const searchFlowsResponseSchema = contentSearchResponseSchema(flowResultSchema);
export const searchableAppsResponseSchema = z.array(searchableAppSchema);
export const popularAppsResponseSchema = valueResponseSchema(z.array(popularAppEntrySchema));
export const collectionsResponseSchema = valueResponseSchema(z.array(collectionSchema));
export const dictionaryDefinitionsResponseSchema = valueResponseSchema(
  z.array(dictionaryCategorySchema),
);
