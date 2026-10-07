import Link from "next/link";
import { notFound } from "next/navigation";
import { PostArticle } from "@/components/blog/blog-ui";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { findPost, livePosts } from "@/lib/blog";
import { ctaCopy } from "@/lib/launch";

export const revalidate = 300;

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const post = findPost(slug, new Date());
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.summary,
      url: `/blog/${post.slug}`,
      publishedTime: new Date(post.publishAt).toISOString(),
      images: [`https://i.ytimg.com/vi/${post.youTubeId}/maxresdefault.jpg`],
    },
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
      <div className="container max-w-3xl py-14">
        <p className="mb-6 text-sm text-muted-foreground"><Link href="/blog" className="hover:underline">News</Link> / {post.tag}</p>
        <PostArticle post={post} signupHref={ctaCopy().primary.href} />
        {more.length > 0 && (
          <section className="mt-12 border-t pt-8">
            <h2 className="text-sm font-semibold">More news</h2>
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
