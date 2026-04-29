interface BuildCspOptions {
  nonce: string;
  isProd: boolean;
}

/**
 * Builds a Content-Security-Policy header value.
 *
 * Style-src uses 'unsafe-inline' for Tailwind CSS runtime injection.
 * Acknowledged trade-off: Tailwind v4 CSS-in-JS approach requires this.
 * Follow-up: narrow to hashes once Tailwind build output is stable.
 *
 * Dev mode adds ws: to connect-src for Next.js HMR websocket.
 * Prod mode omits ws:.
 */
export function buildCsp({ nonce, isProd }: BuildCspOptions): string {
  const connectSrc = isProd
    ? "'self'"
    : "'self' ws://localhost:*";

  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://cdn.jsdelivr.net",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  return directives.join("; ");
}
