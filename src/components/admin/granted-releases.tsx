import { Film } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/admin/copy-button";
import { QrDownload } from "@/components/admin/qr-download";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtNum, pct } from "@/lib/utils";
import { formatInTz, isReleased } from "@/lib/time";

export type GrantedRelease = {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  coverUrl: string;
  releaseDate: Date;
  url: string;
  labelName: string;
  timezone: string;
  variants: { slug: string }[];
  totals: { views: number; clicks: number; presaves: number };
};

/**
 * Releases a label puts out under this artist's name, shown on the artist's own dashboard.
 *
 * Read-only by design and by construction. There is no edit link here because there is no edit
 * route an outside account could reach: every release write scopes by the caller's own
 * organisation, and this artist is not in the label's. The fan list is missing for the same
 * reason it should be — those fans pre-saved a release the label put out, so they're the
 * label's, not the artist's, and no export appears here.
 *
 * "Make a clip" is not an exception to that. It reads the title, the artwork and the link — all of
 * which are on the public release page anyway — and renders in the artist's own browser from a
 * file on their own computer. Nothing is written and nothing of the label's is uploaded.
 */
export function GrantedReleases({ releases }: { releases: GrantedRelease[] }) {
  if (releases.length === 0) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Released by your labels</h2>
        <p className="text-sm text-muted-foreground">
          Your numbers, your links and your clips for releases a label put out under your name. They stay the label&apos;s to edit.
        </p>
      </div>
      <div className="space-y-3">
        {releases.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.coverUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{r.title}</h3>
                  <Badge variant="secondary">{r.labelName}</Badge>
                  {isReleased(r.releaseDate)
                    ? <Badge variant="success">Live</Badge>
                    : <Badge variant="warning">Out {formatInTz(r.releaseDate, r.timezone, { dateStyle: "medium" })}</Badge>}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>{fmtNum(r.totals.views)} views</span>
                  <span>{fmtNum(r.totals.clicks)} clicks</span>
                  <span>{pct(r.totals.clicks, r.totals.views)} CTR</span>
                  <span>{fmtNum(r.totals.presaves)} pre-saves</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={r.url} label="Main link" />
                  {r.variants.map((v) => <CopyButton key={v.slug} value={`${r.url}/${v.slug}`} label={`${v.slug} link`} />)}
                  <QrDownload value={r.url} filename={`${r.slug}-qr`} label="QR download" />
                  {/* The one thing here that isn't a link: the artist promoting the release is the
                      one who wants a clip of it, and the render happens entirely in their browser
                      from a file on their own computer, so nothing about it touches the label's. */}
                  <Link href={`/admin/clips/${r.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 text-xs text-foreground hover:bg-violet-500/20">
                    <Film className="h-3.5 w-3.5" /> Make a clip
                  </Link>
                  <Link href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border px-3 text-xs text-muted-foreground hover:text-foreground">
                    View page ↗
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
