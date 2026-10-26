"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Work the statement out again from today's confirmed sheets, or delete it. */
export function StatementActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go(path: string, method: string) {
    setBusy(true);
    const res = await fetch(path, { method }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr("That didn't work. Try again."); return false; }
    setErr(null);
    return true;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={async () => { if (await go(`/api/admin/royalties/${id}/calculate`, "POST")) router.refresh(); }}>Work it out again</Button>
      <Button asChild size="sm" variant="outline"><a href={`/api/admin/royalties/${id}/export`}>Everyone as CSV</a></Button>
      <button type="button" disabled={busy} className="text-sm text-muted-foreground hover:text-red-400" onClick={async () => { if (window.confirm("Delete this statement and everything worked out from it?") && (await go(`/api/admin/royalties/${id}`, "DELETE"))) router.push("/admin/royalties"); }}>Delete</button>
      {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
