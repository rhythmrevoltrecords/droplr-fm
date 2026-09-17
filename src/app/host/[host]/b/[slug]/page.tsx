import { redirect } from "next/navigation";
import { BioRoute, bioMetadata, loadBio } from "@/components/public/bio-route";
import { SITE_URL } from "@/lib/env";
import { activeCustomDomain } from "@/lib/plans";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ host: string; slug: string }> };

export async function generateMetadata(props: P) {
  const params = await props.params;
  return bioMetadata(await loadBio(params.slug, decodeURIComponent(params.host)));
}
export default async function TenantBioPage(props: P) {
  const params = await props.params;
  const host = decodeURIComponent(params.host).toLowerCase().split(":")[0];
  const page = await loadBio(params.slug, host);
  // Custom domain paused after a downgrade: the bio page still works on droplr.fm (307, it can come back).
  if (page && !host.endsWith(".droplr.fm") && !activeCustomDomain(page.organization)) redirect(`${SITE_URL}/b/${page.slug}`);
  return <BioRoute page={page} />;
}
