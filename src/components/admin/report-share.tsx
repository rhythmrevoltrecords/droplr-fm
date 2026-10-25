"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Turn the shareable release report on or off. Off by default: nothing about a release
 * is public until the label asks for a link, and rotating the token kills the old one.
 */
export function ReportShare({ releaseId, url: initial, sharedButHidden }: { releaseId: string; url: string | null; sharedButHidden: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(initial);
  // Sharing is on but droplr can't show the link here (made before links were stored encrypted and
  // not yet converted, or its copy can't be read). Saying "off" would be untrue: the link works.
  const [hidden, setHidden] = useState(sharedButHidden && !initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(action: "enable" | "rotate" | "disable", label: string) {
    setBusy(label);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/admin/releases/${releaseId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
      if (!res.ok) {
        setError(j.error ?? "That didn't work.");
        return;
      }
      setUrl(j.url ?? null);
      setHidden(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Shareable report</div>
            <p className="text-sm text-muted-foreground">
              A one-page summary for a distributor, manager or grant application. Numbers only — no fan is named on it.
            </p>
          </div>
          {!url && !hidden && (
            <Button size="sm" disabled={!!busy} onClick={() => act("enable", "Enable")}>
              {busy === "Enable" ? "Creating…" : "Create a link"}
            </Button>
          )}
        </div>

        {hidden && (
          <div className="space-y-2">
            <p className="text-sm">
              Sharing is on, but this page can&apos;t show the link. Anyone who already has it can still open the report.
              Make a new link to see it here (the old one stops working), or turn sharing off.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act("rotate", "Rotate")}>
                {busy === "Rotate" ? "Working…" : "New link (breaks the old one)"}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("disable", "Disable")}>
                {busy === "Disable" ? "Turning off…" : "Turn sharing off"}
              </Button>
            </div>
          </div>
        )}

        {url && (
          <>
            <div className="flex flex-wrap gap-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1" aria-label="Report link" />
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    setError("Couldn't copy — select the link and copy it manually.");
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <a href={url} target="_blank" rel="noreferrer">Open</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can see it, so treat it like a private URL. Search engines are asked not to index it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act("rotate", "Rotate")}>
                {busy === "Rotate" ? "Working…" : "New link (breaks the old one)"}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("disable", "Disable")}>
                {busy === "Disable" ? "Turning off…" : "Turn sharing off"}
              </Button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
