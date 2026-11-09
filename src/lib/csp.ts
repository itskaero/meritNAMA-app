/**
 * Content Security Policy, set per request by src/proxy.ts with a fresh nonce.
 *
 * - Scripts: only this app's, carrying the nonce Next.js adds to its own scripts
 *   ('strict-dynamic' lets those load their chunks). Development adds 'unsafe-eval',
 *   which React needs there for error overlays.
 * - Styles: 'unsafe-inline' because components set style attributes (chart sizes,
 *   bar widths), which nonces cannot cover; a nonce here would disable it.
 * - No third parties at runtime: fonts are self-hosted, Google sign-in is a server
 *   redirect (no script), and nothing may frame the app.
 * - No upgrade-insecure-requests: a NAS reached over plain HTTP on a VPN would break.
 *   HTTPS is enforced at the reverse proxy (docs/DEPLOYMENT.md).
 */
export function contentSecurityPolicy(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
