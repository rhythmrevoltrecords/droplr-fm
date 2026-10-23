import { LEGAL_DOCS, type LegalSlug } from "./legal";
import { pageMeta } from "./seo";

/** A legal page's title, canonical and description, from LEGAL_DOCS. Its own file so lib/legal stays import-free. */
export function legalMeta(slug: LegalSlug) {
  const d = LEGAL_DOCS.find((x) => x.slug === slug)!;
  return pageMeta({ title: d.title, description: d.blurb, path: `/legal/${d.slug}` });
}
