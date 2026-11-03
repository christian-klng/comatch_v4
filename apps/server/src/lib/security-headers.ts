/**
 * Sicherheits-Header für alle Antworten. Sie stehen in der App statt im Reverse-Proxy, damit sie
 * hinter jedem Proxy gleich gelten (Caddy, Traefik von Coolify).
 */
export function securityHeaders(publicBaseUrl: string): Record<string, string> {
  const url = new URL(publicBaseUrl);
  const https = url.protocol === "https:";
  // 'self' deckt WebSockets nicht in allen Safari-Versionen ab, daher die Adresse ausdrücklich.
  const socketOrigin = `${https ? "wss" : "ws"}://${url.host}`;
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // Inline-Styles braucht React für dynamische Farben und Größen.
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    `connect-src 'self' ${socketOrigin}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  return {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    // Kamera nur für die eigene Seite (Selfie), sonst nichts.
    "permissions-policy": "camera=(self), microphone=(), geolocation=()",
    ...(https ? { "strict-transport-security": "max-age=31536000" } : {}),
  };
}
