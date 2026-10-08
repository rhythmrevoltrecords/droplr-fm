"use client";
import { Download, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { closeConfirmationMatches } from "@/lib/account-close";

/**
 * One confirmation, and the export sits above it rather than after it.
 *
 * The export is not required before closing — making it mandatory would be a step in a funnel, and
 * someone who already has their list shouldn't have to download it twice to leave. It is simply
 * first, and marked once it has been taken.
 */
export function CloseAccountForm({ accountName }: { accountName: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = closeConfirmationMatches(typed, accountName);

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/account/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "That didn't work. Nothing has been deleted.");
        setBusy(false);
        return;
      }
      router.push("/?closed=1");
    } catch {
      setError("That didn't work. Nothing has been deleted.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-5">
        <h2 className="font-semibold">First, take your fan list</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every address, with the consent each person gave and when they gave it. This works on every plan,
          including Free — it&apos;s your list, and you shouldn&apos;t have to pay to walk out with it.
        </p>
        <Button asChild variant="outline" className="mt-4" onClick={() => setExported(true)}>
          <a href="/api/admin/account/close/export" download>
            <Download className="mr-2 h-4 w-4" aria-hidden /> Download fan list (CSV)
          </a>
        </Button>
        {exported && <p className="mt-2 text-xs text-emerald-400">Downloaded. Check the file opens before you go on.</p>}
      </div>

      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-foreground">Then close the account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This happens straight away and cannot be undone. There is no grace period and nothing is archived — copies in backups are overwritten in the normal cycle and can&apos;t be restored to you.
            </p>
            <div className="mt-4 max-w-sm">
              <Label htmlFor="confirm">Type <span className="font-mono text-foreground">{accountName}</span> to confirm</Label>
              <Input
                id="confirm"
                value={typed}
                onChange={(e) => { setTyped(e.target.value); setError(null); }}
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5"
              />
            </div>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <Button variant="destructive" className="mt-4" disabled={!matches || busy} onClick={() => void close()}>
              {busy ? "Closing…" : "Close account permanently"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
