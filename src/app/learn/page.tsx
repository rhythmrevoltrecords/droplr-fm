import Link from "next/link";
import { GuideCards } from "@/components/learn/learn-ui";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { ctaCopy } from "@/lib/launch";
import { LEGAL_NOTE } from "@/lib/learn";

export const metadata = {
  title: "Knowledge for independent artists",
  description: "Plain-language guides for independent artists and labels: royalties in Australia, choosing a distributor, Spotify and store tools, release planning, deals and contracts.",
};

export default function LearnIndex() {
  const cta = ctaCopy();
  return (
    <MarketingShell>
      <div className="container max-w-4xl py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/90">Knowledge</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">The stuff nobody tells independent artists.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          How royalties actually reach you in Australia, what distributors really cost, which promo tools are worth money, and what the words in a contract mean. Written for people releasing their own music.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Every guide opens here. The detailed version is inside droplr, with printable templates — splits sheet, release metadata, release checklist, press one-pager — on every plan including Free.</p>
        <div className="mt-10"><GuideCards base="/learn" /></div>
        <div className="mt-10 rounded-2xl border border-violet-500/30 bg-violet-500/[0.07] p-6">
          <h2 className="text-lg font-semibold">Get the full guides</h2>
          <p className="mt-1 text-sm text-muted-foreground">A droplr account gets you the complete knowledge board and the printable templates, plus pre-save pages, a fan list and a promo plan for your releases.</p>
          <Link href={cta.primary.href} className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90">{cta.primary.label}</Link>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">{LEGAL_NOTE}</p>
      </div>
    </MarketingShell>
  );
}
