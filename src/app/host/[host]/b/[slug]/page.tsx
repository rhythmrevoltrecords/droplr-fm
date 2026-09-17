import { BioRoute, bioMetadata, loadBio } from "@/components/public/bio-route";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ host: string; slug: string }> };

export async function generateMetadata(props: P) {
  const params = await props.params;
  return bioMetadata(await loadBio(params.slug, decodeURIComponent(params.host)));
}
export default async function TenantBioPage(props: P) {
  const params = await props.params;
  return <BioRoute page={await loadBio(params.slug, decodeURIComponent(params.host))} />;
}
