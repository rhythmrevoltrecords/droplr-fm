import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolvePlatformPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string; second: string; third: string }>; searchParams: Promise<SearchParams> };
const resolve = async (p: P) => {
  const params = await p.params;
  return resolvePlatformPath([params.slug, params.second, params.third]);
};

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return (
    <PublicRoute resolution={await resolve(p)} searchParams={(await p.searchParams)} orgHrefBase={(s) => `/${s}`} />
  );
}
