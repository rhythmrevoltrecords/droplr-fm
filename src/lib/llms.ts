/**
 * /llms.txt: a plain-text map of droplr.fm for AI assistants and AI search (llmstxt.org).
 *
 * Whether any of them read it is an open question; it costs one route. What matters is that it
 * can't go stale: every line is generated from something the site already shows (the plan table,
 * the guides, the live posts), so changing those changes this, and there is nothing here to keep
 * up to date by hand.
 *
 * Pure: the route passes the data in.
 */

export type LlmsInput = {
  site: string;
  title: string;
  description: string;
  plans: { audience: string; tiers: { name: string; price: string; blurb: string }[] }[];
  guides: { slug: string; title: string; summary: string }[];
  posts: { slug: string; title: string; summary: string }[];
};

const line = (s: string) => s.replace(/\s+/g, " ").trim();

export function llmsTxt(i: LlmsInput): string {
  const out: string[] = [`# ${line(i.title)}`, "", `> ${line(i.description)}`, ""];
  out.push("## Pricing", "", "Prices are in Australian dollars a month.", "");
  for (const p of i.plans) {
    out.push(`### For ${p.audience.toLowerCase()}s`, "");
    for (const t of p.tiers) out.push(`- ${t.name} (${t.price}): ${line(t.blurb)}`);
    out.push("");
  }
  out.push(`Full comparison: ${i.site}/pricing`, "");
  out.push("## Free tools", "", `- [Release plan](${i.site}/tools/release-plan): every promo step for a release, dated from the day you pick, as a calendar file.`, "");
  if (i.guides.length) {
    out.push("## Guides", "");
    for (const g of i.guides) out.push(`- [${line(g.title)}](${i.site}/learn/${g.slug}): ${line(g.summary)}`);
    out.push("");
  }
  if (i.posts.length) {
    out.push("## News and guides (blog)", "");
    for (const p of i.posts) out.push(`- [${line(p.title)}](${i.site}/blog/${p.slug}): ${line(p.summary)}`);
    out.push("");
  }
  out.push("## Optional", "", `- [Custom domains](${i.site}/docs/custom-domain)`, `- [Bring your own Spotify app](${i.site}/docs/spotify-byo)`, `- [Legal](${i.site}/legal)`, "");
  return out.join("\n");
}
