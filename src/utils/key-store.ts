import fs from "node:fs";
import path from "node:path";
import { AUTH_DIR } from "./auth-store.js";

const KEY_FILE = path.join(AUTH_DIR, "anon-key.json");

interface StoredAnonKey {
  key: string;
  discoveredAt: number;
}

/**
 * Read a previously-discovered Supabase publishable key from disk.
 * Returns `null` if the file is missing, malformed, or contains a value
 * that doesn't look like an `sb_publishable_*` key.
 */
export function readStoredAnonKey(): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(KEY_FILE, "utf-8")) as Partial<StoredAnonKey>;
    if (typeof data.key === "string" && data.key.startsWith("sb_publishable_")) {
      return data.key;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist a discovered key so subsequent process boots skip the scrape.
 * Failures are silent — the in-memory key is still usable.
 */
export function writeStoredAnonKey(key: string): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const tmp = KEY_FILE + ".tmp";
  fs.writeFileSync(
    tmp,
    JSON.stringify({ key, discoveredAt: Date.now() } satisfies StoredAnonKey, null, 2),
    { mode: 0o600 },
  );
  fs.renameSync(tmp, KEY_FILE);
}
