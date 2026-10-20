import Link from "next/link";
import { Plus } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { bioPageLimit, bioPublicUrl } from "@/lib/bio";
import { rosterBioPages } from "@/lib/bio-roster";
import { prisma } from "@/lib/db";
import { fmtNum } from "@/lib/utils";

export default async function BioList() {
  const user = await requireUser("label");
  const [pages, theirs] = await Promise.all([
    prisma.bioPage.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, include: { links: { select: { clicks: true } } } }),
    // Read-only, public pages only, no numbers. See lib/bio-roster for why it is this narrow.
    user.organization.kind === "artist" ? Promise.resolve([]) : rosterBioPages(user.organizationId),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bio links</h1>
          <p className="text-sm text-muted-foreground">{user.organization.kind === "artist" ? "One link for everything you do, themed from its image." : "One link for the label or each artist, themed from its image."}</p>
        </div>
        {pages.length < bioPageLimit(user.organization.kind)
          ? <Button asChild><Link href="/admin/bio/new"><Plus /> New bio link</Link></Button>
          : <p className="text-sm text-muted-foreground">One bio link per account — edit the one you have.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((p) => {
          const url = bioPublicUrl(user.organization, p.slug);
          const clicks = p.links.reduce((n, l) => n + l.clicks, 0);
          return (
            <Card key={p.id} className="overflow-hidden p-0">
              <Link href={`/admin/bio/${p.id}`} className="relative block h-28 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl saturate-150" />
                <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${p.accentColor ?? "#8B5CF6"}66, transparent 70%), linear-gradient(180deg, transparent, rgba(0,0,0,.7))` }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt="" className="absolute left-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full object-cover ring-1 ring-white/20" style={{ boxShadow: `0 10px 30px -8px ${p.accentColor ?? "#8B5CF6"}` }} />
              </Link>
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Link href={`/admin/bio/${p.id}`} className="font-semibold hover:underline">{p.title}</Link>
                  {!p.isPublic && <Badge variant="secondary">Hidden</Badge>}
                  {user.organization.kind !== "artist" && <Badge variant="secondary">Made by you</Badge>}
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground"><span>{fmtNum(p.views)} views</span><span>{fmtNum(clicks)} clicks</span><span>{p.links.length} links</span></div>
                <CopyButton value={url} label="Copy link" />
              </div>
            </Card>
          );
        })}
        {!pages.length && <Card className="col-span-full p-10 text-center text-sm text-muted-foreground">No bio links yet.</Card>}
      </div>

      {theirs.length > 0 && (
        /* Deliberately a line, not a card. The label needs two facts — the artist has a page, and
           here is its public link — so they don't build a second one. Showing the artwork and a
           preview would be the label looking at the artist's page from inside their own account,
           which is not what the roster link was agreed to. */
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Your artists&apos; own pages</h2>
            <p className="text-sm text-muted-foreground">
              These artists already have a bio link on their own account, so you don&apos;t need to make one
              for them. You can open and share it; only they can edit it.
            </p>
          </div>
          <Card className="divide-y p-0">
            {theirs.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 p-4">
                <span className="font-medium">{p.artistName}</span>
                <Badge variant="secondary">Made by the artist</Badge>
                <code className="min-w-0 max-w-full flex-1 truncate rounded bg-secondary px-2 py-1 text-xs">{p.url}</code>
                <CopyButton value={p.url} />
                <Button asChild size="sm" variant="ghost"><a href={p.url} target="_blank" rel="noreferrer">Open</a></Button>
              </div>
            ))}
          </Card>
        </section>
      )}

    </div>
  );
}
