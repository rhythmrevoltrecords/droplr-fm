import { BioRoute, bioMetadata, loadBio } from "@/components/public/bio-route";

export const dynamic = "force-dynamic";
type P = { params: { host: string; slug: string } };

export async function generateMetadata({ params }: P) {
  return bioMetadata(await loadBio(params.slug, decodeURIComponent(params.host)));
}
export default async function TenantBioPage({ params }: P) {
  return <BioRoute page={await loadBio(params.slug, decodeURIComponent(params.host))} />;
}
