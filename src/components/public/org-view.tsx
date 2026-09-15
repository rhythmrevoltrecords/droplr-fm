import Link from "next/link";
import { prisma } from "@/lib/db";
import { isReleased } from "@/lib/time";

export async function OrgView({ org, hrefBase }: { org: { id: string; name: string; logoUrl: string | null }; hrefBase: string }) {
  const releases = await prisma.release.findMany({ where: { organizationId: org.id, isPublic: true }, orderBy: { releaseDate: "desc" }, take: 60 });
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Releases</p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {releases.map((r) => (
          <Link key={r.id} href={`${hrefBase}/${r.slug}`} className="group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.coverUrl} alt="" className="aspect-square w-full rounded-xl object-cover ring-1 ring-white/10 transition group-hover:ring-white/30" />
            <div className="mt-2 truncate text-sm font-medium">{r.title}</div>
            <div className="truncate text-xs text-muted-foreground">{r.artistName} · {isReleased(r.releaseDate) ? "Out now" : "Pre-save"}</div>
          </Link>
        ))}
        {releases.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Nothing here yet.</p>}
      </div>
    </main>
  );
}
