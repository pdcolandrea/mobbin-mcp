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
   * Supports three cookie formats:
   * 1. Chunked: `sb-...-auth-token.0=<part1>; sb-...-auth-token.1=<part2>` (Supabase SSR default)
   * 2. Single (un-chunked): `sb-...-auth-token=<url-encoded-json>` (older Supabase clients)
   * 3. Raw JSON: direct `{"access_token": "..."}` string (e.g. from `document.cookie` copy)
   */
  private static parseSessionFromCookie(cookie: string): SupabaseSession {
    // Try parsing as raw JSON first (handles direct session JSON input)
    try {
      const parsed = JSON.parse(cookie) as Partial<SupabaseSession> | null;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.access_token === "string" &&
        typeof parsed.refresh_token === "string" &&
        typeof parsed.expires_at === "number"
      ) {
        return parsed as SupabaseSession;
      }
    } catch {
      // Not raw JSON, continue with cookie parsing
    }

    const cookies = cookie.split("; ").reduce<Record<string, string>>((acc, part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        acc[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
      }
      return acc;
    }, {});

    const chunk0 = cookies[`${SUPABASE_COOKIE_PREFIX}.0`] ?? "";
    const chunk1 = cookies[`${SUPABASE_COOKIE_PREFIX}.1`] ?? "";
    const unchunked = cookies[SUPABASE_COOKIE_PREFIX] ?? "";

    // Try all candidate formats — chunked first, then un-chunked
    const candidates = [
      ...(chunk0 || chunk1 ? [chunk0 + chunk1] : []),
      ...(unchunked ? [unchunked] : []),
    ];

    for (const candidate of candidates) {
      // Format A: base64-prefixed JSON (recent Supabase versions)
      if (candidate.startsWith("base64-")) {
        try {
          const decoded = Buffer.from(
            candidate.slice("base64-".length),
            "base64",
          ).toString("utf-8");
          return JSON.parse(decoded) as SupabaseSession;
        } catch {
          // fall through
        }
      }
      // Format B: URL-encoded JSON (older Supabase versions)
      try {
        return JSON.parse(decodeURIComponent(candidate)) as SupabaseSession;
      } catch {
        // try next candidate
      }
    }

    throw new Error(
      `Failed to parse Supabase session from cookie. ` +
        `Make sure MOBBIN_AUTH_COOKIE contains the '${SUPABASE_COOKIE_PREFIX}.0' and '.1' cookies, ` +
        `or the un-chunked '${SUPABASE_COOKIE_PREFIX}' cookie (base64- or URL-encoded).`,
    );
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
