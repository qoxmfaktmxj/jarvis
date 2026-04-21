/**
 * Edge-safe session cookie resolution.
 *
 * Two cookie names coexist during migration: `sessionId` (current login route)
 * and `jarvis_session` (legacy / SSO). Resolve with a single ordered lookup
 * so middleware and server-side auth agree on which session is active.
 */
export const SESSION_COOKIE_NAMES = ["sessionId", "jarvis_session"] as const;

export type SessionCookieName = (typeof SESSION_COOKIE_NAMES)[number];

export interface CookieSource {
  get(name: string): { value: string } | undefined;
}

export function resolveSessionId(cookies: CookieSource): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const raw = cookies.get(name)?.value;
    if (raw && raw.length > 0) return raw;
  }
  return null;
}
