import { ODESLI_MAP, type PlatformKey } from "./platforms";

export type ResolvedRelease = {
  found: boolean;
  status: number;
  title?: string;
  artistName?: string;
  coverUrl?: string;
  links: { platform: PlatformKey; url: string }[];
  deezerId?: string;
};

type OdesliResponse = {
  entityUniqueId: string;
  entitiesByUniqueId: Record<string, { id: string; type: string; title?: string; artistName?: string; thumbnailUrl?: string; apiProvider: string }>;
  linksByPlatform: Record<string, { url: string; entityUniqueId: string }>;
};

export async function resolveWithOdesli(sourceUrl: string): Promise<ResolvedRelease> {
  const u = new URL("https://api.song.link/v1-alpha.1/links");
  u.searchParams.set("url", sourceUrl);
  u.searchParams.set("userCountry", "AU");
  if (process.env.ODESLI_API_KEY) u.searchParams.set("key", process.env.ODESLI_API_KEY);

  let res: Response;
  try {
    res = await fetch(u, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch {
    return { found: false, status: 0, links: [] };
  }
  // Unreleased tracks usually come back 404 (or 400 "could not resolve").
  if (!res.ok) return { found: false, status: res.status, links: [] };

  const data = (await res.json()) as OdesliResponse;
  const entity = data.entitiesByUniqueId[data.entityUniqueId];
  const links: ResolvedRelease["links"] = [];
  let deezerId: string | undefined;
  for (const [key, link] of Object.entries(data.linksByPlatform ?? {})) {
    const platform = ODESLI_MAP[key];
    if (!platform) continue;
    links.push({ platform, url: link.url });
    if (key === "deezer") deezerId = data.entitiesByUniqueId[link.entityUniqueId]?.id;
  }
  return {
    found: true,
    status: res.status,
    title: entity?.title,
    artistName: entity?.artistName,
    coverUrl: entity?.thumbnailUrl,
    links,
    deezerId,
  };
}
