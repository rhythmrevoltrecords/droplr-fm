import Link from "next/link";
import { Plus } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { bioPublicUrl } from "@/lib/bio";
import { prisma } from "@/lib/db";
import { fmtNum } from "@/lib/utils";

export default async function BioList() {
  const user = await requireUser("label");
  const pages = await prisma.bioPage.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, include: { links: { select: { clicks: true } } } });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bio links</h1>
          <p className="text-sm text-muted-foreground">One link for the label or each artist, themed from its image.</p>
        </div>
        <Button asChild><Link href="/admin/bio/new"><Plus /> New bio link</Link></Button>
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
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground"><span>{fmtNum(p.views)} views</span><span>{fmtNum(clicks)} clicks</span><span>{p.links.length} links</span></div>
                <CopyButton value={url} label="Copy link" />
              </div>
            </Card>
          );
        })}
        {!pages.length && <Card className="col-span-full p-10 text-center text-sm text-muted-foreground">No bio links yet.</Card>}
      </div>
    </div>
  );
}
