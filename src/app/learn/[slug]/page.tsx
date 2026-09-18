import { notFound } from "next/navigation";
import { PublicGuide } from "@/components/learn/learn-ui";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { ctaCopy } from "@/lib/launch";
import { GUIDES } from "@/lib/learn";
import Link from "next/link";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = GUIDES.find((g) => g.slug === slug);
  return guide ? { title: guide.title, description: guide.summary } : {};
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
