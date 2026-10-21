import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/site-chrome";
import { GALLERY_INDEX_MIN } from "@/lib/bio-gallery";
import { galleryPages, type GalleryCard } from "@/lib/bio-gallery-server";
import { ctaCopy } from "@/lib/launch";

/**
 * droplr.fm/b -- bio pages their owners chose to show. Rules in lib/bio-gallery.
 *
 * Read per request, never at build: a build must not need a database, and a page that was listed
 * an hour ago and unticked since must not still be here.
 */
export const dynamic = "force-dynamic";

async function load(): Promise<GalleryCard[] | null> {
  try {
    return await galleryPages();
  } catch (e) {
    console.error("[gallery]", e);
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pages = await load();
  const enough = !!pages && pages.length >= GALLERY_INDEX_MIN;
  return {
    title: "Live bio pages",
    description: "Link-in-bio pages independent artists and labels made on droplr.fm and chose to show here.",
    alternates: { canonical: "/b" },
    // An almost-empty room is not a page to send Google to.
    robots: enough ? undefined : { index: false, follow: true },
  };
}

export default async function Gallery() {
  const pages = await load();
  const cta = ctaCopy();
  return (
    <MarketingShell>
      <div className="container max-w-5xl py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/90">Live pages</p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Real pages, made by the people on them.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Every page here is live, and is here because the artist or label who made it ticked a box asking to be.
          Open one and it&apos;s the same page their fans get.
        </p>

        {pages === null ? (
          <p className="mt-10 rounded-2xl border p-6 text-sm text-muted-foreground">The pages can&apos;t be loaded right now. Try again in a minute.</p>
        ) : pages.length === 0 ? (
          // Said plainly rather than padded with examples. A sample page here would be a demo
          // reading as a real one, which is the one thing this page must never do.
          <div className="mt-10 rounded-2xl border p-6">
            <h2 className="text-lg font-semibold">Nobody has listed their page yet.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages appear here when their owners choose to show them, and not before.
            </p>
          </div>
        ) : (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p) => (
              <li key={p.url}>
                <a href={p.url} className="mk-card flex h-full items-center gap-4 p-4 transition hover:border-white/25">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                    style={{ boxShadow: `0 10px 30px -10px ${p.accentColor ?? "#8B5CF6"}` }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.title}</span>
                    {p.blurb && <span className="mt-0.5 line-clamp-2 block text-sm text-white/60">{p.blurb}</span>}
                    <span className="mt-1 block truncate text-xs text-white/40">{p.url.replace(/^https?:\/\//, "")}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12 rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Make your own</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A bio page is on every plan, including Free. To put yours here, tick &ldquo;Show it in the gallery&rdquo; on
            the page&apos;s settings; untick it and it comes off.
          </p>
          <Link href={cta.primaryShort.href} className="mt-4 inline-flex text-sm font-medium text-violet-200 hover:text-white">{cta.primaryShort.label} &rarr;</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
