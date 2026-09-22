import Link from "next/link";
import { notFound } from "next/navigation";
import { isLabelRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { DownloadForm } from "@/components/admin/download-form";
import { getSoundCloudCreds } from "@/lib/soundcloud";
import { GATE_PLATFORMS, isGatePlatform, type GateAction, type GatePlatform } from "@/lib/downloads";
import { publicReleaseUrl } from "@/lib/releases";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Download" };

export default async function EditDownloadPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser("label");
  const r = await prisma.release.findFirst({
    where: { id, organizationId: user.organizationId, kind: "download", ...(isLabelRole(user.role) ? {} : { artistId: user.id }) },
    include: { gateSteps: { orderBy: { position: "asc" } } },
  });
  if (!r) notFound();

  const sc = await getSoundCloudCreds(user.organizationId);
  const url = publicReleaseUrl(user.organization, r.slug, SITE_URL);

  // Per-step drop-off: how many people got as far as each step. The number nobody else gives an
  // artist, and the one that tells them which ask is costing them downloads.
  const unlocks = await prisma.gateUnlock.findMany({ where: { releaseId: r.id }, select: { via: true, completedAt: true } });
  const started = unlocks.length;
  const finished = unlocks.filter((u) => u.completedAt).length;
  const perStep = r.gateSteps.map((s) => ({
    label: isGatePlatform(s.platform) ? GATE_PLATFORMS[s.platform].label : s.platform,
    done: unlocks.filter((u) => u.via.includes(s.platform)).length,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
        <a href={url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
          {url.replace(/^https?:\/\//, "")} ↗
        </a>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">How it&apos;s going</h2>
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <div><span className="block text-2xl font-semibold">{started}</span><span className="text-xs text-muted-foreground">started</span></div>
          <div><span className="block text-2xl font-semibold">{finished}</span><span className="text-xs text-muted-foreground">got the file</span></div>
        </div>
        {perStep.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm">
            {perStep.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-muted-foreground">{s.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-violet-500" style={{ width: `${started ? Math.round((s.done / started) * 100) : 0}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{s.done}</span>
              </li>
            ))}
          </ul>
        )}
        {started === 0 && <p className="mt-3 text-xs text-muted-foreground">Nobody&apos;s tried it yet. <Link href="/admin/downloads" className="underline">Share the link.</Link></p>}
      </Card>

      <DownloadForm
        soundcloudConnected={!!sc}
        initial={{
          id: r.id,
          title: r.title,
          artistName: r.artistName,
          coverUrl: r.coverUrl,
          slug: r.slug,
          downloadUrl: r.downloadUrl ?? "",
          downloadNote: r.downloadNote ?? "",
          isPublic: r.isPublic,
          steps: r.gateSteps
            .filter((s) => isGatePlatform(s.platform))
            .map((s) => ({ platform: s.platform as GatePlatform, action: s.action as GateAction, target: s.target ?? "", required: s.required })),
        }}
      />
    </div>
  );
}
