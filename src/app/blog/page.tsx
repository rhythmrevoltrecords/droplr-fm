import Link from "next/link";
import { PostCards } from "@/components/blog/blog-ui";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { livePosts } from "@/lib/blog";

export const metadata = {
  title: "News for independent artists",
  description:
    "Short, sourced explainers on the music-business news that actually reaches independent artists and labels: streaming fraud, AI tools, distribution and the small print.",
  alternates: { canonical: "/blog" },
};

/** Posts appear on their publishAt, so this page can't be baked at build time. */
export const revalidate = 300;

export default function BlogIndex() {
  const posts = livePosts(new Date());
  return (
    <MarketingShell>
      <div className="container max-w-4xl py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/90">News</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">What happened, and what it means for you.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Music-business news, explained for people releasing their own music. Every post is sourced, short, and ends
          with something you can actually do. There is a video of each one if you would rather watch it.
        </p>
        <div className="mt-10"><PostCards posts={posts} /></div>
        <div className="mt-12 rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Looking for the how-to guides?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Royalties in Australia, choosing a distributor, the six-week release plan and what the words in a contract
            mean all live in <Link href="/learn" className="underline hover:text-foreground">Knowledge</Link>.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
