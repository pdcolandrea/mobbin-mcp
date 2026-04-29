import {
  SUPABASE_URL,
  SUPABASE_COOKIE_PREFIX,
  TOKEN_REFRESH_BUFFER_SECONDS,
  COOKIE_CHUNK_SIZE,
} from "../constants.js";
import { anonKey } from "./anon-key.js";

export interface SupabaseSession {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Manages Supabase auth tokens for the Mobbin API.
 *
 * The session is stored in two chunked cookies (`sb-...-auth-token.0` and `.1`)
 * because the JSON payload exceeds the 4KB single-cookie limit.
 *
 * On each request, {@link getCookieValue} checks whether the access token is
 * about to expire and proactively refreshes it via Supabase's
 * `POST /auth/v1/token?grant_type=refresh_token` endpoint.
 */
export class MobbinAuth {
  private session: SupabaseSession;
  private rawCookie: string;
  private refreshPromise: Promise<void> | null = null;
  private onSessionRefreshed?: (session: SupabaseSession) => void;

  private constructor(
    session: SupabaseSession,
    rawCookie: string,
    onSessionRefreshed?: (session: SupabaseSession) => void,
  ) {
    this.session = session;
    this.rawCookie = rawCookie;
    this.onSessionRefreshed = onSessionRefreshed;
  }

  static fromCookie(rawCookie: string): MobbinAuth {
    const session = MobbinAuth.parseSessionFromCookie(rawCookie);
    return new MobbinAuth(session, rawCookie);
  }

  static fromSession(
    session: SupabaseSession,
    onSessionRefreshed?: (session: SupabaseSession) => void,
  ): MobbinAuth {
    const rawCookie = MobbinAuth.buildCookieString(session);
    return new MobbinAuth(session, rawCookie, onSessionRefreshed);
  }

  /**
   * Returns a valid cookie string for use in request headers.
   * Automatically refreshes the token if it's expired or about to expire.
   */
  getSession(): SupabaseSession {
    return this.session;
  }

  async getCookieValue(): Promise<string> {
    if (this.isExpiringSoon()) {
      await this.refresh();
    }
    return this.rawCookie;
  }

  /** True if the access token expires within {@link TOKEN_REFRESH_BUFFER_SECONDS}. */
  private isExpiringSoon(): boolean {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds >= this.session.expires_at - TOKEN_REFRESH_BUFFER_SECONDS;
  }

  /**
   * Refresh the session using Supabase's token endpoint.
   * Deduplicates concurrent refresh calls so only one runs at a time.
   */
  private async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    let res = await this.callRefreshEndpoint(anonKey.get());

    // Mobbin rotated their publishable key. Try to discover the new one and retry once.
    if (res.status === 401) {
      const body = await res.text().catch(() => "");
      if (body.includes("Unregistered API key")) {
        const recovered = await anonKey.rediscover();
        if (recovered) {
          res = await this.callRefreshEndpoint(recovered);
        } else {
          throw refreshFailureError(401, body);
        }
      } else {
        throw refreshFailureError(401, body);
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw refreshFailureError(res.status, text);
    }

    const newSession = (await res.json()) as SupabaseSession;
    this.session = newSession;
    this.rawCookie = MobbinAuth.buildCookieString(newSession);

    if (this.onSessionRefreshed) {
      this.onSessionRefreshed(newSession);
    }
  }

  private async callRefreshEndpoint(apiKey: string): Promise<Response> {
    return fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        refresh_token: this.session.refresh_token,
      }),
    });
  }

  /**
   * Parse the Supabase session JSON from the raw cookie string.
   *
   * Supabase SSR writes the session in one of two formats:
   *   1. Legacy — URL-encoded JSON, optionally split across `.0`/`.1`/... chunks.
   *   2. `base64-` — the literal prefix `base64-` followed by base64-encoded
   *      JSON, also optionally chunked. Chunking happens by byte-splitting the
   *      full `base64-...` string, so only the first chunk carries the prefix.
   *
   * Chunks are read in order (`.0`, `.1`, `.2`, ...) until the first gap, which
   * matches how `@supabase/ssr` reassembles cookies.
   */
  private static parseSessionFromCookie(cookie: string): SupabaseSession {
    const cookies = cookie.split("; ").reduce<Record<string, string>>((acc, part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        acc[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
      }
      return acc;
    }, {});

    // For small sessions Supabase writes the whole value under the bare name
    // (no `.N` suffix). Otherwise it splits into `.0`, `.1`, ... by byte
    // length. Prefer the chunked form and fall back to the bare cookie.
    let joined: string;
    if (cookies[`${SUPABASE_COOKIE_PREFIX}.0`] !== undefined) {
      const parts: string[] = [];
      for (let i = 0; ; i++) {
        const part = cookies[`${SUPABASE_COOKIE_PREFIX}.${i}`];
        if (part === undefined) break;
        parts.push(part);
      }
      joined = parts.join("");
    } else {
      joined = cookies[SUPABASE_COOKIE_PREFIX] ?? "";
    }

    // Buffer.from(..., "base64") never throws — invalid input silently produces
    // garbage bytes, which then fail in the JSON.parse below with a clearer error.
    const combined = joined.startsWith("base64-")
      ? Buffer.from(joined.slice("base64-".length), "base64").toString("utf-8")
      : decodeURIComponent(joined);

    try {
      return JSON.parse(combined) as SupabaseSession;
    } catch {
      throw new Error(
        `Failed to parse Supabase session from cookie. ` +
          `Make sure MOBBIN_AUTH_COOKIE contains the '${SUPABASE_COOKIE_PREFIX}.*' cookies.`,
      );
    }
  }

  /**
   * Rebuild the raw cookie string from a session object in the `base64-`
   * format that Mobbin's server expects. Sessions larger than
   * {@link COOKIE_CHUNK_SIZE} bytes are split across `.0`, `.1`, ... chunks
   * (matching `@supabase/ssr`'s chunker) — the legacy URL-encoded form is
   * rejected as "unauthenticated" by Mobbin's API routes.
   */
  private static buildCookieString(session: SupabaseSession): string {
    const value = "base64-" + Buffer.from(JSON.stringify(session), "utf-8").toString("base64");
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += COOKIE_CHUNK_SIZE) {
      chunks.push(value.slice(i, i + COOKIE_CHUNK_SIZE));
    }
    return chunks.map((chunk, i) => `${SUPABASE_COOKIE_PREFIX}.${i}=${chunk}`).join("; ");
  }
}

function refreshFailureError(status: number, body: string): Error {
  return new Error(
    `Token refresh failed (${status}): ${body.substring(0, 200)}. ` +
      "Run 'npx mobbin-mcp auth' to re-authenticate.",
  );
}
