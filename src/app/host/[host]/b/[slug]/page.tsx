import { redirect } from "next/navigation";
import { BioRoute, bioMetadata, loadBio } from "@/components/public/bio-route";
import { SITE_URL } from "@/lib/env";
import { activeCustomDomain } from "@/lib/plans";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ host: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(props: { params: Promise<{ host: string; slug: string }> }) {
  const params = await props.params;
  return bioMetadata(await loadBio(params.slug, decodeURIComponent(params.host)));
}
export default async function TenantBioPage(props: P) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const done = typeof query.done === "string" ? query.done : null;
  const host = decodeURIComponent(params.host).toLowerCase().split(":")[0];
  const page = await loadBio(params.slug, host);
  // Custom domain paused after a downgrade: the bio page still works on droplr.fm (307, it can come back).
  if (page && !host.endsWith(".droplr.fm") && !activeCustomDomain(page.organization)) redirect(`${SITE_URL}/b/${page.slug}`);
  return <BioRoute page={page} done={done} />;
}
