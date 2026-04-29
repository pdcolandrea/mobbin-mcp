import { MOBBIN_BASE_URL } from "../constants.js";

const MAIN_APP_CHUNK_RE = /\/_next\/static\/chunks\/main-app-[A-Za-z0-9_-]+\.js/g;
const PUBLISHABLE_KEY_RE = /sb_publishable_[A-Za-z0-9_-]+/;

export interface DiscoverOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Scrape the current Supabase publishable key from Mobbin's web bundle.
 *
 * Mobbin embeds the literal `sb_publishable_*` key in the `main-app-*.js`
 * chunk linked from the homepage HTML. We fetch the HTML, locate the chunk
 * URL, fetch the chunk, and pluck the key with a regex.
 *
 * Returns `null` (never throws) on any failure — caller decides what to do.
 * The whole operation shares one {@link AbortController} so the total budget
 * is bounded by `timeoutMs` regardless of how many chunks are tried.
 */
export async function discoverPublishableKey(opts: DiscoverOptions = {}): Promise<string | null> {
  const { timeoutMs = 10_000, fetchFn = fetch } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const homeRes = await fetchFn(`${MOBBIN_BASE_URL}/`, { signal: controller.signal });
    if (!homeRes.ok) return null;
    const html = await homeRes.text();

    const chunkPaths = [...new Set([...html.matchAll(MAIN_APP_CHUNK_RE)].map((m) => m[0]))];
    for (const path of chunkPaths) {
      const chunkRes = await fetchFn(`${MOBBIN_BASE_URL}${path}`, { signal: controller.signal });
      if (!chunkRes.ok) continue;
      const chunkText = await chunkRes.text();
      const match = chunkText.match(PUBLISHABLE_KEY_RE);
      if (match) return match[0];
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
