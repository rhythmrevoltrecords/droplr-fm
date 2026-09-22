import Link from "next/link";
import { requireUser, isLabelRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { downloadsUsed } from "@/lib/downloads";
import { planOf } from "@/lib/plans";
import { publicReleaseUrl } from "@/lib/releases";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Downloads" };

export default async function DownloadsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  const plan = planOf(org.plan);

  const [rows, used] = await Promise.all([
    prisma.release.findMany({
      where: { organizationId: user.organizationId, kind: "download", ...(isLabelRole(user.role) ? {} : { artistId: user.id }) },
      orderBy: { createdAt: "desc" },
      include: { gateSteps: true, _count: { select: { gateUnlocks: true, preSaves: true } } },
    }),
    downloadsUsed(user.organizationId),
  ]);
  const atLimit = Number.isFinite(plan.downloads) && used >= plan.downloads;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A free file behind a gate — an edit pack, stems, unreleased, a VIP. You keep the emails.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {Number.isFinite(plan.downloads) && (
            <span className="text-xs text-muted-foreground">{used} of {plan.downloads} used</span>
          )}
          <Button asChild disabled={atLimit}><Link href="/admin/downloads/new">New download</Link></Button>
        </div>
      </div>

      {atLimit && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {plan.name} includes {plan.downloads} download gates in any 12 months. Upgrade to add more — the ones you have stay live.
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nothing here yet. A download gate is the easiest thing to give someone a reason to hand over an email —
          they get a file, you get a fan you can reach next time.
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const url = publicReleaseUrl(org, r.slug, SITE_URL);
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/downloads/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                    <p className="truncate text-xs text-muted-foreground">{r.artistName} · {url.replace(/^https?:\/\//, "")}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{r.gateSteps.length} step{r.gateSteps.length === 1 ? "" : "s"}</span>
                    <span aria-hidden>·</span>
                    <span>{r._count.gateUnlocks} unlocked</span>
                    <span aria-hidden>·</span>
                    <span>{r._count.preSaves} email{r._count.preSaves === 1 ? "" : "s"}</span>
                  </div>
                  {!r.isPublic && <Badge variant="secondary">Hidden</Badge>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
