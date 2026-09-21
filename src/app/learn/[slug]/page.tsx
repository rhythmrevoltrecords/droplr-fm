import { notFound } from "next/navigation";
import { PublicGuide } from "@/components/learn/learn-ui";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { ctaCopy } from "@/lib/launch";
import { GUIDES } from "@/lib/learn";
import Link from "next/link";

/** guide.checked is free text a human edits. An unparseable date must not fail the build. */
function isoOrUndefined(s: string) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) return {};
  // A canonical is the point here, not decoration: every guide is also reachable at
  // /admin/learn/{slug} and /dashboard/learn/{slug} for signed-in accounts, and the public one
  // is the version that should rank.
  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical: `/learn/${guide.slug}` },
    openGraph: {
      type: "article",
      title: guide.title,
      description: guide.summary,
      url: `/learn/${guide.slug}`,
      publishedTime: isoOrUndefined(guide.checked),
    },
  };
}

export default async function LearnGuide(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) notFound();
  return (
    <MarketingShell>
      <div className="container max-w-3xl py-14">
        <p className="mb-6 text-sm text-muted-foreground"><Link href="/learn" className="hover:underline">Knowledge</Link> / {guide.tag}</p>
        <PublicGuide guide={guide} signupHref={ctaCopy().primary.href} />
      </div>
    </MarketingShell>
  );
}
