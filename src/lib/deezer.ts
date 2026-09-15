// Deezer OAuth + library writes. Deezer suspended new app creation in June 2026,
// so everything here is gated by DEEZER_ENABLED=true AND org.deezerEnabled.
export const DEEZER_PERMS = "basic_access,email,offline_access,manage_library";

export function deezerAuthorizeUrl(state: string) {
  const u = new URL("https://connect.deezer.com/oauth/auth.php");
  u.searchParams.set("app_id", process.env.DEEZER_APP_ID ?? "");
  u.searchParams.set("redirect_uri", process.env.DEEZER_REDIRECT_URI ?? "");
  u.searchParams.set("perms", DEEZER_PERMS);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function deezerExchange(code: string) {
  const u = new URL("https://connect.deezer.com/oauth/access_token.php");
  u.searchParams.set("app_id", process.env.DEEZER_APP_ID ?? "");
  u.searchParams.set("secret", process.env.DEEZER_SECRET ?? "");
  u.searchParams.set("code", code);
  u.searchParams.set("output", "json");
  const res = await fetch(u);
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { access_token?: string };
    if (!j.access_token) throw new Error(text);
    return j.access_token; // with offline_access this token does not expire
  } catch {
    throw new Error(`Deezer token exchange failed: ${text}`);
  }
}

export async function deezerMe(token: string) {
  const res = await fetch(`https://api.deezer.com/user/me?access_token=${encodeURIComponent(token)}`);
  const j = (await res.json()) as { id?: number; error?: { message: string } };
  return j.id ? String(j.id) : null;
}

export function parseDeezerAlbumId(url: string | undefined | null) {
  const m = url?.match(/deezer\.com\/(?:[a-z]{2}\/)?album\/(\d+)/);
  return m?.[1] ?? null;
}

export async function deezerSaveAlbum(token: string, albumId: string) {
  const res = await fetch(
    `https://api.deezer.com/user/me/albums?album_id=${albumId}&access_token=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
  const text = await res.text();
  if (text.includes('"error"')) throw new Error(`Deezer save failed: ${text}`);
}
