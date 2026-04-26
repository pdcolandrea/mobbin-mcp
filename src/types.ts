import type { z } from "zod";
import type {
  previewScreenSchema,
  searchableAppSchema,
  appResultSchema,
  screenResultSchema,
  flowScreenSchema,
  flowResultSchema,
  collectionSchema,
  dictionaryCategorySchema,
} from "./services/schemas.js";

/**
 * Public types for Mobbin API entities. These are inferred from zod schemas in
 * `src/services/schemas.ts` so the runtime contract and the static type cannot drift.
 *
 * Don't add fields here — add them to the schema and the type follows.
 */

export type PreviewScreen = z.infer<typeof previewScreenSchema>;
export type SearchableApp = z.infer<typeof searchableAppSchema>;
export type AppResult = z.infer<typeof appResultSchema>;
export type ScreenResult = z.infer<typeof screenResultSchema>;
export type FlowScreen = z.infer<typeof flowScreenSchema>;
export type FlowResult = z.infer<typeof flowResultSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type DictionaryCategory = z.infer<typeof dictionaryCategorySchema>;

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
