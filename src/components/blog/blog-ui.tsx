import { ArrowRight, Newspaper } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Blocks } from "@/components/learn/learn-ui";
import { PostPlayer } from "@/components/blog/post-player";
import { postDate, type Post } from "@/lib/blog";

export function PostCards({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">The first posts go up shortly.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {posts.map((p) => (
        <Link key={p.slug} href={`/blog/${p.slug}`} className="group rounded-2xl border p-5 transition-colors hover:border-violet-400/40 hover:bg-white/[0.03]">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Newspaper className="h-3.5 w-3.5 text-violet-300" aria-hidden /> {p.tag} · {postDate(p)} · {p.minutes} min
          </div>
          <h2 className="mt-2.5 text-balance font-semibold group-hover:text-foreground">{p.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.summary}</p>
        </Link>
      ))}
    </div>
  );
}

export function PostArticle({ post, signupHref }: { post: Post; signupHref: string }) {
  return (
    <article>
      <header>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{post.tag}</Badge>
          <span>{postDate(post)}</span>
          <span aria-hidden>·</span>
          <span>{post.minutes} min read</span>
        </div>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{post.summary}</p>
      </header>

      <div className="mt-8"><PostPlayer post={post} /></div>
      <div className="mt-8"><Blocks blocks={post.body} /></div>

      {post.sources.length > 0 && (
        <section className="mt-10 border-t pt-6">
          <h2 className="text-sm font-semibold">Sources</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {post.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">{s.label}</a></li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 rounded-2xl border border-violet-500/30 bg-violet-500/[0.07] p-6">
        <h2 className="text-lg font-semibold">Own the relationship, not the numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">droplr is pre-saves, smart links and download gates that turn a listener into someone you can reach again. Free plan, no card.</p>
        <Link href={signupHref} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90">
          Start free <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        General information for independent artists, not legal, tax or financial advice. Reporting on a case or an
        investigation describes where it stood on the date above and nothing is a finding against anyone.
      </p>
    </article>
  );
}
