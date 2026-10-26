import { hasBeta } from "@/lib/beta";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgreementForm } from "@/components/admin/agreement-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { standing } from "@/lib/agreements";
import { formOptions, toFormValue } from "@/lib/agreements-page";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { zonedDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agreement" };

export default async function AgreementPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const user = await requireUser("label");
  // Not switched on for this account: the feature doesn't exist here.
  if (!hasBeta(user.organization, "agreements")) notFound();
  const a = await prisma.agreement.findFirst({ where: { id, organizationId: user.organizationId }, include: { releases: { select: { releaseId: true } } } });
  if (!a) notFound();
  const opts = await formOptions(user.organizationId);
  const s = standing(a, zonedDay(new Date(), user.organization.timezone));
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground"><Link href="/admin/agreements" className="hover:underline">Agreements</Link> / {a.title}</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        {s && <Badge variant={s.tone === "warn" ? "warning" : "secondary"}>{s.text}</Badge>}
        {a.documentUrl && <a href={a.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-violet-400 underline">Open the signed copy <ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      {sp.created && <Card className="border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">Agreement recorded.</Card>}
      <Card><CardContent className="pt-6"><AgreementForm id={a.id} initial={toFormValue(a)} artists={opts.artists} releases={opts.releases} /></CardContent></Card>
    </div>
  );
}
