import { BioRoute, bioMetadata, loadBio } from "@/components/public/bio-route";

export const dynamic = "force-dynamic";
type P = { params: { slug: string } };

export async function generateMetadata({ params }: P) {
  return bioMetadata(await loadBio(params.slug));
}
export default async function BioPage({ params }: P) {
  return <BioRoute page={await loadBio(params.slug)} />;
}
