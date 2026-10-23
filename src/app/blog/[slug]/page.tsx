import Link from "next/link";
import { notFound } from "next/navigation";
import { PostArticle } from "@/components/blog/blog-ui";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { findPost, livePosts, postThumb } from "@/lib/blog";
import { SITE_URL } from "@/lib/env";
import { snippet } from "@/lib/seo";
import { articleJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/seo/json-ld";
import { ctaCopy } from "@/lib/launch";

export const revalidate = 300;

/**
 * Built ahead and cached, then refreshed every 5 minutes. Without this the route rendered on every
 * request (~0.65s to first byte, private no-store), which is slow for Google and for readers. A post
 * whose publishAt arrives later is rendered on its first request and cached from then on; until
 * then it 404s, as before.
 */
export function generateStaticParams() {
  return livePosts(new Date()).map((p) => ({ slug: p.slug }));
}
export const dynamicParams = true;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = findPost(slug, new Date());
  if (!post) return {};
  // The title matches the video's, and they run to 68 characters: the " · droplr.fm" suffix would
  // push them past what a search result shows. The description is the card blurb, trimmed to fit.
  const description = snippet(post.summary);
  return {
    title: { absolute: post.title },
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `/blog/${post.slug}`,
      publishedTime: new Date(post.publishAt).toISOString(),
      images: [postThumb(post)],
    },
    // Without its own twitter block a post inherits the site's, and X shows the homepage card.
    twitter: { card: "summary_large_image" as const, title: post.title, description, images: [postThumb(post)] },
  };
}

export default async function BlogPost(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const now = new Date();
  const post = findPost(slug, now);
  // A post whose video has not gone public yet is a 404, not a page with a dead embed.
  if (!post) notFound();
  const more = livePosts(now).filter((p) => p.slug !== post.slug).slice(0, 2);
  return (
    <MarketingShell>
      <JsonLd data={articleJsonLd({ title: post.title, summary: post.summary, url: `${SITE_URL}/blog/${post.slug}`, published: new Date(post.publishAt).toISOString(), image: postThumb(post), siteUrl: SITE_URL })} />
      <div className="container max-w-3xl py-14">
        <p className="mb-6 text-sm text-muted-foreground"><Link href="/blog" className="hover:underline">News and guides</Link> / {post.tag}</p>
        <PostArticle post={post} signupHref={ctaCopy().primary.href} />
        {more.length > 0 && (
          <section className="mt-12 border-t pt-8">
            <h2 className="text-sm font-semibold">More posts</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {more.map((p) => (
                <li key={p.slug}><Link href={`/blog/${p.slug}`} className="text-muted-foreground underline hover:text-foreground">{p.title}</Link></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </MarketingShell>
  );
}
