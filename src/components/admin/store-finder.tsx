import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tidalConfigured } from "@/lib/odesli";
import { platformMeta, storeSearchUrl, type PlatformKey } from "@/lib/platforms";

/** Stores droplr can't look up by UPC/ISRC (no public API), plus any a fan asked for that has no link yet. */
const MANUAL: PlatformKey[] = ["beatport", "traxsource", "bandcamp", "juno", "soundcloud", "youtubeMusic", "amazonMusic", "audius", "youtube"];
export function StoreFinder({ query, have, demand }: { query: string; have: string[]; demand: Record<string, number> }) {
  const AUTO: PlatformKey[] = ["spotify", "appleMusic", "deezer", ...(tidalConfigured() ? (["tidal"] as const) : [])];
  const missing = [...new Set([...MANUAL, ...AUTO, "tidal" as PlatformKey, ...(Object.keys(demand) as PlatformKey[])])].filter((p) => !have.includes(p));
  const wanted = missing.filter((p) => demand[p]).sort((a, b) => (demand[b] ?? 0) - (demand[a] ?? 0));
  const rest = missing.filter((p) => !demand[p]);
  if (!missing.length) return null;
  const row = (p: PlatformKey) => {
    const url = storeSearchUrl(p, query);
    return (
      <li key={p} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
        <span className="flex-1 font-medium">{platformMeta(p).name}</span>
        {demand[p] ? <span className="text-xs text-amber-400">{demand[p]} fan{demand[p] === 1 ? "" : "s"} chose this</span> : AUTO.includes(p) ? <span className="text-xs text-muted-foreground">auto-checked</span> : null}
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-violet-400 underline">Search <ExternalLink className="h-3 w-3" /></a>}
      </li>
    );
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing store links</CardTitle>
        <CardDescription>
          Beatport, Bandcamp, SoundCloud, Amazon and YouTube Music have no lookup droplr can use, so search, copy the release URL and add it above. Fans who picked a store without a link get their email up to 6 hours later while it&apos;s found, then with &quot;All platforms&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {wanted.map(row)}
          {rest.map(row)}
        </ul>
      </CardContent>
    </Card>
  );
}
