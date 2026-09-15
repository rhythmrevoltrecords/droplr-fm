import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolveTenantPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
type P = { params: { host: string; slug: string; variant: string }; searchParams: SearchParams };
const resolve = ({ params }: P) => resolveTenantPath(decodeURIComponent(params.host), [params.slug, params.variant]);

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return <PublicRoute resolution={await resolve(p)} searchParams={p.searchParams} orgHrefBase={() => ""} />;
}
