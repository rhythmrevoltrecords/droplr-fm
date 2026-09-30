import { isEnforcement, type Enforcement } from "./gate-steps";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8888").replace(/\/$/, "");
export const SITE_HOST = new URL(SITE_URL).host;

/** Hosts that serve the droplr.fm platform itself (not a tenant custom domain). */
export function isPlatformHost(host: string | null | undefined) {
  if (!host) return true;
  const h = host.toLowerCase().split(":")[0];
  return (
    h === SITE_HOST.split(":")[0] ||
    h === "droplr.fm" ||
    h === "www.droplr.fm" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".netlify.app") ||
    h.endsWith(".netlify.live")
  );
}

/** yourorg.droplr.fm → "yourorg" */
export function platformSubdomain(host: string | null | undefined) {
  if (!host) return null;
  const h = host.toLowerCase().split(":")[0];
  const m = h.match(/^([a-z0-9-]+)\.droplr\.fm$/);
  if (!m || m[1] === "www") return null;
  return m[1];
}

export const deezerGloballyEnabled = () => process.env.DEEZER_ENABLED === "true" && !!process.env.DEEZER_APP_ID;

/**
 * Current enforcement state for gate steps droplr performs on the fan's behalf (SoundCloud).
 *
 * Server-side only — deliberately not NEXT_PUBLIC_, because the public gate page receives it as a
 * prop from the server component rather than reading it in the browser. Set
 * SOUNDCLOUD_GATE_ENFORCEMENT to "voluntary" the day the API is paused and every live gate degrades
 * on the next request; set it to "unavailable" to drop the step entirely. An unrecognised value
 * falls back to "enforced" rather than silently weakening every gate on a typo.
 */
export function soundcloudGateEnforcement(): Enforcement {
  const v = process.env.SOUNDCLOUD_GATE_ENFORCEMENT?.trim().toLowerCase();
  return isEnforcement(v) ? v : "enforced";
}
