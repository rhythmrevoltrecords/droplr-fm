import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolveTenantPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
type P = { params: { host: string; slug: string }; searchParams: SearchParams };
const resolve = ({ params, searchParams }: P) => resolveTenantPath(decodeURIComponent(params.host), [params.slug], typeof searchParams.v === "string" ? searchParams.v : null);

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return <PublicRoute resolution={await resolve(p)} searchParams={p.searchParams} orgHrefBase={() => ""} />;
}
