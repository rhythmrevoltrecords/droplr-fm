/**
 * Which requests the middleware refuses as cross-site writes. Pure, so the test can call it.
 *
 * Only the signed-in APIs: the dashboard, the platform console, the artist area, account and billing
 * actions. The public fan endpoints (pre-save, gate, bio subscribe, contest entry) need no session,
 * so a forged request there gains nothing a direct one doesn't. Webhooks, the cron jobs and the
 * one-click unsubscribe are called by servers that send no Origin and carry their own secret or
 * signed token, and none of them is on this list anyway.
 *
 * A browser sends Origin on every POST, PUT, PATCH and DELETE. No Origin at all means a non-browser
 * client (curl, a server), which can't ride a visitor's cookie, so it is let through. "null" is what
 * a sandboxed frame or a cross-site redirect sends, and is refused.
 */
export const SIGNED_IN_API = /^\/api\/(?:admin|platform|artist|auth|push|messages|roster-link|feedback|stripe\/(?:checkout|portal))(?:\/|$)/;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossOriginWrite(method: string, pathname: string, origin: string | null, host: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (!SIGNED_IN_API.test(pathname)) return false;
  if (origin === null) return false;
  if (origin === "null") return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  return originHost.toLowerCase() !== host.toLowerCase();
}
