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
   * Supports four cookie formats, tried in this order:
   * 1. Raw JSON: direct `{"access_token": "..."}` string (e.g. caller passes a session JSON)
   * 2. Chunked: `sb-...-auth-token.0=<part1>; sb-...-auth-token.1=<part2>` (Supabase SSR default)
   * 3. Single un-chunked, base64-prefixed: `sb-...-auth-token=base64-<b64-json>` (recent Supabase SSR)
   * 4. Single un-chunked, URL-encoded JSON: `sb-...-auth-token=<url-encoded-json>` (older Supabase clients)
   *
   * Every decode path validates that the result has `access_token`, `refresh_token`, and
   * `expires_at` before returning. Malformed candidates fall through so a later candidate
   * can succeed, instead of returning a partial session that would fail later in auth.
   */
  private static parseSessionFromCookie(cookie: string): SupabaseSession {
    const isSupabaseSession = (value: unknown): value is SupabaseSession => {
      const session = value as Partial<SupabaseSession> | null;
      return (
        !!session &&
        typeof session === "object" &&
        typeof session.access_token === "string" &&
        typeof session.refresh_token === "string" &&
        typeof session.expires_at === "number"
      );
    };

    const parseCandidate = (value: string): SupabaseSession | null => {
      try {
        const parsed = JSON.parse(value);
        return isSupabaseSession(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };

    // Try parsing as raw JSON first (handles direct session JSON input)
    const rawParsed = parseCandidate(cookie);
    if (rawParsed) return rawParsed;

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
          const parsed = parseCandidate(decoded);
          if (parsed) return parsed;
        } catch {
          // fall through
        }
      }
      // Format B: URL-encoded JSON (older Supabase versions)
      try {
        const parsed = parseCandidate(decodeURIComponent(candidate));
        if (parsed) return parsed;
      } catch {
        // try next candidate
      }
    }

    throw new Error(
      `Failed to parse Supabase session from cookie. ` +
        `Accepted formats: raw JSON session; chunked '${SUPABASE_COOKIE_PREFIX}.0' + '.1' cookies; ` +
        `or un-chunked '${SUPABASE_COOKIE_PREFIX}' cookie (base64-prefixed or URL-encoded JSON). ` +
        `Decoded candidates must include access_token, refresh_token, and expires_at.`,
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
