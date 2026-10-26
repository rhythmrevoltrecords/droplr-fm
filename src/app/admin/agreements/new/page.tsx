import { hasBeta } from "@/lib/beta";
import { notFound } from "next/navigation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgreementForm, EMPTY_AGREEMENT } from "@/components/admin/agreement-form";
import { Card, CardContent } from "@/components/ui/card";
import { contractsAllowed } from "@/lib/agreements-server";
import { formOptions } from "@/lib/agreements-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "New agreement" };

export default async function NewAgreementPage(props: { searchParams: Promise<{ artist?: string; release?: string }> }) {
  const sp = await props.searchParams;
  const user = await requireUser("label");
  // Not switched on for this account: the feature doesn't exist here.
  if (!hasBeta(user.organization, "agreements")) notFound();
  if (!contractsAllowed(user.organization).can) redirect("/admin/agreements");
  const opts = await formOptions(user.organizationId);
  // Prefill from the roster or release page, but only with ids that are this account's own.
  const initial = {
    ...EMPTY_AGREEMENT,
    artistId: opts.artists.some((a) => a.id === sp.artist) ? sp.artist! : "",
    releaseIds: opts.releases.some((r) => r.id === sp.release) ? [sp.release!] : [],
  };
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground"><Link href="/admin/agreements" className="hover:underline">Agreements</Link> / New</p>
      <h1 className="text-2xl font-semibold">Add an agreement</h1>
      <Card><CardContent className="pt-6"><AgreementForm initial={initial} artists={opts.artists} releases={opts.releases} /></CardContent></Card>
    </div>
  );
}
