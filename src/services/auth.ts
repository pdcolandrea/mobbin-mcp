import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_COOKIE_PREFIX,
  TOKEN_REFRESH_BUFFER_SECONDS,
} from "../constants.js";

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
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        refresh_token: this.session.refresh_token,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Token refresh failed (${res.status}): ${text.substring(0, 200)}. ` +
          "Run 'npx mobbin-mcp auth' to re-authenticate.",
      );
    }

    const newSession = (await res.json()) as SupabaseSession;
    this.session = newSession;
    this.rawCookie = MobbinAuth.buildCookieString(newSession);

    if (this.onSessionRefreshed) {
      this.onSessionRefreshed(newSession);
    }
  }

  /**
   * Parse the Supabase session JSON from the raw cookie string.
   *
   * Supabase SSR writes the session in one of two formats:
   *   1. Legacy — URL-encoded JSON, optionally split across `.0`/`.1` chunks.
   *   2. `base64-` — the literal prefix `base64-` followed by base64-encoded
   *      JSON, also optionally chunked. Chunking happens by byte-splitting the
   *      full `base64-...` string, so only the first chunk carries the prefix.
   *
   * We detect the format by looking at the reassembled chunk 0.
   */
  private static parseSessionFromCookie(cookie: string): SupabaseSession {
    const cookies = cookie.split("; ").reduce<Record<string, string>>((acc, part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        acc[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
      }
      return acc;
    }, {});

    // Supabase only splits the session into `.0`/`.1` chunks when the value
    // exceeds the ~4KB single-cookie limit. Smaller sessions are written to
    // the bare cookie name with no suffix, so fall back to that.
    const chunk0 = cookies[`${SUPABASE_COOKIE_PREFIX}.0`] ?? cookies[SUPABASE_COOKIE_PREFIX] ?? "";
    const chunk1 = cookies[`${SUPABASE_COOKIE_PREFIX}.1`] ?? "";
    const joined = chunk0 + chunk1;

    let combined: string;
    if (joined.startsWith("base64-")) {
      try {
        combined = Buffer.from(joined.slice("base64-".length), "base64").toString("utf-8");
      } catch {
        throw new Error(
          `Failed to base64-decode Supabase session cookie. ` +
            `Make sure MOBBIN_AUTH_COOKIE contains the complete '${SUPABASE_COOKIE_PREFIX}.0' and '.1' cookies.`,
        );
      }
    } else {
      combined = decodeURIComponent(joined);
    }

    try {
      return JSON.parse(combined) as SupabaseSession;
    } catch {
      throw new Error(
        `Failed to parse Supabase session from cookie. ` +
          `Make sure MOBBIN_AUTH_COOKIE contains the '${SUPABASE_COOKIE_PREFIX}.0' and '.1' cookies.`,
      );
    }
  }

  /**
   * Rebuild the raw cookie string from a session object.
   * Splits the JSON across two cookies to match Supabase's chunking behavior.
   */
  private static buildCookieString(session: SupabaseSession): string {
    const encoded = encodeURIComponent(JSON.stringify(session));
    const midpoint = Math.ceil(encoded.length / 2);
    const chunk0 = encoded.substring(0, midpoint);
    const chunk1 = encoded.substring(midpoint);
    return `${SUPABASE_COOKIE_PREFIX}.0=${chunk0}; ${SUPABASE_COOKIE_PREFIX}.1=${chunk1}`;
  }
}
