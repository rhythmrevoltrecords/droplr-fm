import { PublicRoute, releaseMetadata, type SearchParams } from "@/components/public/public-route";
import { resolveTenantPath } from "@/lib/releases";

export const dynamic = "force-dynamic";
// Only exists so presave.label.com/{orgSlug}/{release}/{variant} can redirect to the short /{release}/{variant}.
type P = { params: { host: string; slug: string; variant: string; third: string }; searchParams: SearchParams };
const resolve = ({ params }: P) => resolveTenantPath(decodeURIComponent(params.host), [params.slug, params.variant, params.third]);

export async function generateMetadata(p: P) {
  return releaseMetadata(await resolve(p));
}
export default async function Page(p: P) {
  return <PublicRoute resolution={await resolve(p)} searchParams={p.searchParams} orgHrefBase={() => ""} />;
}
