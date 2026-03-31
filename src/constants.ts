export const MOBBIN_BASE_URL = "https://mobbin.com";
export const SUPABASE_URL = "https://ujasntkfphywizsdaapi.supabase.co";
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 50;
export const CHARACTER_LIMIT = 25000;

/** Public anon key embedded in Mobbin's client JS. Required for Supabase auth API calls. */
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYyNTQ2MDM3NSwiZXhwIjoxOTQxMDM2Mzc1fQ.IgHG-M4znmVhQEa6uWWb3gz-_XXjsSvPPF8NBad8gvk";

/** Cookie name prefix used by Supabase for this project. */
export const SUPABASE_COOKIE_PREFIX = "sb-ujasntkfphywizsdaapi-auth-token";

/** Refresh the token this many seconds before it actually expires. */
export const TOKEN_REFRESH_BUFFER_SECONDS = 300;
