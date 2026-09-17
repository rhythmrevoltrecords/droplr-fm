import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolvePlatformPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };
const resolve = async (p: P) => {
  const params = await p.params; const searchParams = await p.searchParams;
  return resolvePlatformPath([params.slug], typeof searchParams.v === "string" ? searchParams.v : null);
};

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return (
    <PublicRoute resolution={await resolve(p)} searchParams={(await p.searchParams)} orgHrefBase={(s) => `/${s}`} />
  );
}
