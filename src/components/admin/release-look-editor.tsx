"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GateView, type GateStepView, type GateViewData } from "@/components/public/gate-view";
import type { PublicTheme } from "@/components/public/artwork-shell";
import { ReleaseView, type ReleaseViewData } from "@/components/public/release-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasCustomLook } from "@/lib/page-look";
import { PageLookFields, type LookValues } from "./page-look-fields";

export type LookPreview =
  | { kind: "release"; data: ReleaseViewData; live: boolean }
  | { kind: "download"; data: GateViewData; steps: GateStepView[] };

/**
 * The Look tab: theme, font, button colour and background for a release, pre-save, smart link or
 * download page. The preview on the right is the real public component in demo mode, fed the
 * values as they are typed, so what you see is what fans get.
 *
 * On a plan without page looks the controls are replaced by one sentence and a link to the plans.
 * A page that already has a look (styled before a downgrade) keeps it, and can be put back to the
 * default from here — the API allows that on every plan.
 */
export function ReleaseLookEditor({
  releaseId, initial, accentPreview, sample, canEdit, preview, showBranding, theme, upgradeLine,
}: {
  releaseId: string;
  initial: LookValues;
  accentPreview: string;
  sample: string;
  canEdit: boolean;
  preview: LookPreview;
  showBranding: boolean;
  theme: PublicTheme;
  upgradeLine: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<LookValues>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = hasCustomLook(initial);

  async function save(values: LookValues) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/releases/${releaseId}/look`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? "Saved" : (j.error ?? "Couldn't save that.") });
    if (res.ok) router.refresh();
  }

  const reset: LookValues = { theme: "midnight", font: "clean", buttonColor: "", backgroundUrl: "", backgroundColor: "" };
  // The default look is "nothing set", not "Midnight + Clean set". Saving the defaults explicitly
  // would mark the page as customised and give it a skin class it never had.
  const payload = (x: LookValues) => ({
    theme: x.theme === "midnight" ? "" : x.theme,
    font: x.font === "clean" ? "" : x.font,
    buttonColor: x.buttonColor,
    backgroundUrl: x.backgroundUrl,
    backgroundColor: x.backgroundColor,
  });
  const look = payload(v);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Look</CardTitle>
          <CardDescription>
            {preview.kind === "download" ? "How this download page looks to fans." : "How this page looks to fans, before and after release day."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canEdit ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <PageLookFields
                  value={v}
                  onChange={(patch) => { setMsg(null); setV((x) => ({ ...x, ...patch })); }}
                  accentPreview={accentPreview}
                  sample={sample}
                  sampleButton={preview.kind === "download" ? "Download" : "Listen"}
                  fontNote="The preview is the real page. Changes go live when you hit Save."
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void save(look as LookValues)} disabled={busy}>Save</Button>
                <Button variant="ghost" disabled={busy} onClick={() => { setV(reset); void save(payload(reset) as LookValues); }}>Back to default</Button>
                {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
              </div>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{upgradeLine}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild><Link href="/admin/settings/billing">See the plans</Link></Button>
                {saved && (
                  <Button variant="ghost" disabled={busy} onClick={() => { setV(reset); void save(payload(reset) as LookValues); }}>
                    Put this page back to the default
                  </Button>
                )}
                {msg && <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</span>}
              </div>
              {saved && <p className="text-xs text-muted-foreground">This page keeps the look it was given on a paid plan. You can put it back to the default, but not change it, until you upgrade.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="mx-auto h-[510px] w-[300px] overflow-hidden rounded-[2rem] border border-white/10 bg-black">
          <div style={{ width: 390, height: 663, transform: "scale(0.769)", transformOrigin: "top left" }}>
            {preview.kind === "download" ? (
              <GateView preview demo release={{ ...preview.data, look }} steps={preview.steps} unlocked={false} query={{}} showBranding={showBranding} theme={theme} />
            ) : (
              <ReleaseView preview demo release={{ ...preview.data, look }} live={preview.live} query={{}} spotifyEnabled deezerEnabled={false} showBranding={showBranding} theme={theme} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
