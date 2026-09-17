import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolveTenantPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ host: string; slug: string; variant: string }>; searchParams: Promise<SearchParams> };
const resolve = async (p: P) => {
  const params = await p.params;
  return resolveTenantPath(decodeURIComponent(params.host), [params.slug, params.variant]);
};

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return (
    <PublicRoute resolution={await resolve(p)} searchParams={(await p.searchParams)} orgHrefBase={() => ""} />
  );
}
