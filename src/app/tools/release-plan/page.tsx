import Link from "next/link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { ReleasePlanTool } from "@/components/tools/release-plan-tool";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/env";
import { ctaCopy } from "@/lib/launch";
import { AUTOMATIC } from "@/lib/release-plan";
import { toolJsonLd } from "@/lib/structured-data";
import { SITE_CARD } from "@/lib/seo";

const TITLE = "Free music release plan: every promo step, dated";
const DESCRIPTION = "Pick your release day and get a dated promo plan from announcement to two months after. Add it to your calendar. Free, no sign-up.";

export const metadata = {
  title: { absolute: `${TITLE} · droplr.fm` },
  description: DESCRIPTION,
  alternates: { canonical: "/tools/release-plan" },
  openGraph: { type: "website" as const, title: TITLE, description: DESCRIPTION, url: "/tools/release-plan", images: [SITE_CARD.og] },
  twitter: { card: "summary_large_image" as const, title: TITLE, description: DESCRIPTION, images: [SITE_CARD.twitter] },
};

// The same for everyone: nothing here reads the request, so it can be served from the cache.
export const dynamic = "force-static";

export default function ReleasePlanPage() {
  const cta = ctaCopy();
  return (
    <MarketingShell>
      <JsonLd data={toolJsonLd({ name: "Release plan", description: DESCRIPTION, url: `${SITE_URL}/tools/release-plan` })} />
      <div className="container max-w-3xl py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your release plan, dated</h1>
        <p className="mt-3 text-muted-foreground">
          Pick the day your music comes out. You get every promo step from the announcement four weeks before to the
          repost two months after, each on its own date. Add the lot to your calendar or copy it. No sign-up.
        </p>

        <div className="mt-8">
          <ReleasePlanTool site={SITE_URL} />
        </div>

        <section className="mt-12 rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold">This is the plan every droplr release gets</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            In the dashboard it sits on the release, moves when the date moves and ticks off as you go. These happen
            without you:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {AUTOMATIC.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Some steps and some of these need a paid plan. <Link href="/pricing" className="underline underline-offset-2 hover:text-foreground">Pricing</Link> says which.
          </p>
          <Button asChild className="mt-5"><Link href={cta.primary.href}>{cta.primary.label}</Link></Button>
        </section>
      </div>
    </MarketingShell>
  );
}
