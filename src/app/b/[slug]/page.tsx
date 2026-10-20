import { BioRoute, bioMetadata, loadBio } from "@/components/public/bio-route";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return bioMetadata(await loadBio(params.slug));
}
export default async function BioPage(props: P) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const done = typeof query.done === "string" ? query.done : null;
  return <BioRoute page={await loadBio(params.slug)} done={done} />;
}
