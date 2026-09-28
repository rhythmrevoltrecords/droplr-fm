"use client";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ENTRY_STATUSES, judgingSummary, linkCheckNote, type EntryStatus } from "@/lib/contest";

export type EntryRow = {
  id: string;
  artistName: string;
  email: string;
  link: string;
  linkHost: string | null;
  note: string | null;
  labelNote: string | null;
  status: string;
  linkCheck: string;
  enteredAt: string;
  withdrawnAt: string | null;
  country: string | null;
};

const STATUS_LABEL: Record<EntryStatus, string> = {
  new: "Unheard",
  shortlisted: "Shortlist",
  winner: "Winner",
  rejected: "Passed",
};

/**
 * The judging list.
 *
 * Ordered by status then by entry time, so the unheard ones stay at the top and the label always
 * knows where it got to. That matters more than it sounds: a remix contest is fifty links and an
 * evening, and any list that reshuffles as you mark things costs you your place.
 *
 * A broken link is called out on the row rather than hidden. The entrant can't be told automatically
 * — droplr has no idea whether they meant to delete it — but a label that can see it can ask.
 */
export function ContestEntries({ releaseId, entries }: { releaseId: string; entries: EntryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | EntryStatus>("all");
  const summary = judgingSummary(entries.map((e) => ({ status: e.status, linkCheck: e.linkCheck, withdrawnAt: e.withdrawnAt ? new Date(e.withdrawnAt) : null })));

  async function patch(entryId: string, body: Record<string, unknown>) {
    setBusy(entryId);
    await fetch(`/api/admin/releases/${releaseId}/contest/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setBusy(null);
    router.refresh();
  }

  const shown = filter === "all" ? entries : entries.filter((e) => e.status === filter);

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries</CardTitle>
          <CardDescription>Nothing yet. Entries appear here the moment someone submits one.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Entries</CardTitle>
        <CardDescription>
          {summary.total} in{summary.unheard > 0 ? `, ${summary.unheard} you haven't marked` : ", all marked"}
          {summary.broken > 0 && ` · ${summary.broken} with a link that won't open`}
          {summary.withdrawn > 0 && ` · ${summary.withdrawn} withdrawn`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", ...ENTRY_STATUSES] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-xs transition ${filter === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k === "all" ? "All" : STATUS_LABEL[k]}
            </button>
          ))}
          <a
            href={`/api/admin/releases/${releaseId}/contest/export`}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Download as CSV
          </a>
        </div>

        <ul className="space-y-2">
          {shown.map((e) => {
            const note = linkCheckNote(e.linkCheck as "ok" | "gone" | "blocked" | "unchecked");
            return (
              <li
                key={e.id}
                className={`rounded-lg border p-3 text-sm ${e.withdrawnAt ? "border-border/50 opacity-55" : e.status === "winner" ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-border"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {e.artistName}
                      {e.withdrawnAt && <span className="ml-2 text-xs font-normal text-muted-foreground">withdrew</span>}
                    </p>
                    <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      {e.link} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {e.email} · entered {new Date(e.enteredAt).toLocaleString()}
                      {e.linkHost ? ` · ${e.linkHost}` : ""}
                      {e.country ? ` · ${e.country}` : ""}
                    </p>
                  </div>
                  {e.status !== "new" && (
                    <Badge variant={e.status === "winner" ? "default" : "secondary"}>{STATUS_LABEL[e.status as EntryStatus] ?? e.status}</Badge>
                  )}
                </div>

                {note && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                    {note}
                    <button type="button" onClick={() => patch(e.id, { recheckLink: true })} className="inline-flex items-center gap-1 underline underline-offset-2">
                      <RefreshCw className="h-3 w-3" aria-hidden /> check again
                    </button>
                  </p>
                )}
                {e.note && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">&ldquo;{e.note}&rdquo;</p>}

                {!e.withdrawnAt && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {ENTRY_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={busy === e.id || e.status === s}
                        onClick={() => patch(e.id, { status: s })}
                        className={`rounded-md border px-2 py-1 text-xs transition disabled:opacity-40 ${e.status === s ? "border-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                    {busy === e.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing in that group.</p>}
      </CardContent>
    </Card>
  );
}
