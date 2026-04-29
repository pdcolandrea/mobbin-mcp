import { SUPABASE_ANON_KEY } from "../constants.js";
import { readStoredAnonKey, writeStoredAnonKey } from "../utils/key-store.js";
import { discoverPublishableKey } from "./key-discovery.js";

/**
 * Process-global holder for the Supabase publishable (anon) key.
 *
 * Mobbin rotates this key occasionally. We seed from {@link SUPABASE_ANON_KEY}
 * (the value that was live when this build shipped), then prefer a previously
 * discovered key from disk. On a refresh-time `401 "Unregistered API key"`,
 * the auth layer calls {@link AnonKeyManager.rediscover} to scrape the
 * current key from `https://mobbin.com/`'s `main-app-*.js` chunk.
 *
 * Concurrent rediscovery is deduplicated so a burst of failing tool calls
 * triggers exactly one scrape.
 */
class AnonKeyManager {
  private current: string;
  private rediscoverPromise: Promise<string | null> | null = null;

  constructor() {
    this.current = readStoredAnonKey() ?? SUPABASE_ANON_KEY;
  }

  get(): string {
    return this.current;
  }

  /**
   * Scrape Mobbin for the current publishable key.
   * Returns the new key if it differs from the current one and
   * persists it to disk; returns `null` if discovery failed or
   * found the same key we already have.
   */
  async rediscover(): Promise<string | null> {
    if (this.rediscoverPromise) return this.rediscoverPromise;
    this.rediscoverPromise = this.doRediscover().finally(() => {
      this.rediscoverPromise = null;
    });
    return this.rediscoverPromise;
  }

  private async doRediscover(): Promise<string | null> {
    const found = await discoverPublishableKey();
    if (!found || found === this.current) return null;
    this.current = found;
    try {
      writeStoredAnonKey(found);
    } catch {
      // Persistence is best-effort; in-memory value is still good for this process.
    }
    return found;
  }
}

export const anonKey = new AnonKeyManager();
