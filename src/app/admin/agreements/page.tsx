import { hasBeta } from "@/lib/beta";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KIND_LABEL, STATUS_LABEL, standing, type AgreementKind, type AgreementStatus } from "@/lib/agreements";
import { contractsAllowed } from "@/lib/agreements-server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { zonedDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agreements" };

/** Every agreement on the account, the ones needing notice first. Label team only. */
export default async function AgreementsPage(props: { searchParams: Promise<{ artist?: string | string[] }> }) {
  const raw = await props.searchParams;
  const sp = { artist: typeof raw.artist === "string" ? raw.artist : undefined };
  const user = await requireUser("label");
  // Not switched on for this account: the feature doesn't exist here.
  if (!hasBeta(user.organization, "agreements")) notFound();
  const gate = contractsAllowed(user.organization);
  const today = zonedDay(new Date(), user.organization.timezone);
  const rows = await prisma.agreement.findMany({
    where: { organizationId: user.organizationId, ...(sp.artist ? { artistId: sp.artist } : {}) },
    orderBy: [{ endsOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, title: true, kind: true, status: true, counterparty: true, endsOn: true, noticeDays: true, documentUrl: true, artist: { select: { id: true, name: true } }, _count: { select: { releases: true } } },
    take: 1000,
  });
  const ranked = rows
    .map((r) => ({ r, s: standing(r, today) }))
    .sort((a, b) => Number(b.s?.tone === "warn") - Number(a.s?.tone === "warn"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agreements</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Each deal next to the artist and the releases it covers, with a link to the signed copy. droplr reminds your team the day notice is due on a signed agreement with an end date. It keeps the link, never the document, and it doesn&apos;t read or check what&apos;s in it.
          </p>
        </div>
        {gate.can && <Button asChild><Link href="/admin/agreements/new"><Plus /> Add agreement</Link></Button>}
      </div>

      {!gate.can && (
        <Card className="p-4 text-sm text-muted-foreground">
          {gate.why === "artist" ? "Agreements are for label accounts." : <>Agreements are on the Pro and Label plans. <Link href="/admin/settings/billing" className="text-violet-400 underline">See plans</Link>.</>}
          {rows.length > 0 && " The ones you already have stay here, and you can still edit and delete them."}
        </Card>
      )}
      {sp.artist && <p className="text-sm"><Link href="/admin/agreements" className="text-violet-400 underline">Show every artist</Link></p>}

      {!rows.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No agreements recorded{sp.artist ? " for this artist" : ""} yet.</p>
      ) : (
        <ul className="space-y-2">
          {ranked.map(({ r, s }) => (
            <li key={r.id} className={`rounded-xl border p-4 ${s?.tone === "warn" ? "border-amber-500/40" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/agreements/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                <Badge variant="secondary">{KIND_LABEL[r.kind as AgreementKind] ?? r.kind}</Badge>
                <Badge variant={r.status === "signed" ? "success" : "secondary"}>{STATUS_LABEL[r.status as AgreementStatus] ?? r.status}</Badge>
                {s && <Badge variant={s.tone === "warn" ? "warning" : "secondary"}>{s.text}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[r.artist?.name, r.counterparty, r._count.releases ? `${r._count.releases} release${r._count.releases === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "Not linked to an artist or release yet"}
                {!r.documentUrl && r.status === "signed" && <span className="text-amber-400"> · no link to the signed copy</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
