import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolvePlatformPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
type P = { params: { slug: string; second: string; third: string }; searchParams: SearchParams };
const resolve = ({ params }: P) => resolvePlatformPath([params.slug, params.second, params.third]);

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return <PublicRoute resolution={await resolve(p)} searchParams={p.searchParams} orgHrefBase={(s) => `/${s}`} />;
}
