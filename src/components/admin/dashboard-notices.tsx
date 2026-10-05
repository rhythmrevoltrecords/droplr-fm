"use client";
import { ExternalLink, Info, Megaphone, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import type { VisibleMessage } from "@/lib/platform-messages";

const TONE = {
  info: { ring: "border-violet-500/30 bg-violet-500/[0.08]", icon: "text-violet-300", Icon: Megaphone },
  good: { ring: "border-emerald-500/30 bg-emerald-500/[0.08]", icon: "text-emerald-300", Icon: Info },
  warn: { ring: "border-amber-500/30 bg-amber-500/[0.08]", icon: "text-amber-300", Icon: TriangleAlert },
} as const;

/**
 * Notices from droplr.fm, at the top of the dashboard.
 *
 * Dismissal is per message and per login, so a new one always appears even if the last was closed —
 * which is the whole point: this is the channel the Terms mean when they say we'll give notice "in
 * the dashboard", and a notice nobody sees is not notice.
 *
 * Hidden optimistically on click so the banner doesn't sit there while the request goes out. If the
 * write fails it comes back on the next page load, which is the right way round for a notice: the
 * failure mode is seeing it twice, not missing it.
 */
export function DashboardNotices({ messages }: { messages: VisibleMessage[] }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const open = messages.filter((m) => !closed.has(m.id));
  if (!open.length) return null;

  function dismiss(id: string) {
    setClosed((prev) => new Set(prev).add(id));
    void fetch("/api/messages/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  return (
    <div className="no-print mb-6 space-y-3">
      {open.map((m) => {
        const t = TONE[(m.tone as keyof typeof TONE) in TONE ? (m.tone as keyof typeof TONE) : "info"];
        return (
          <div key={m.id} className={`relative rounded-xl border p-4 ${t.ring}`}>
            <div className="flex items-start gap-3">
              <t.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} aria-hidden />
              <div className="min-w-0 flex-1 pr-6">
                {m.title && <p className="text-sm font-semibold">{m.title}</p>}
                {/* Plain text, rendered as text. Newlines are honoured; nothing is parsed as markup,
                    so there is no injection surface even though only we can write these. */}
                <p className="whitespace-pre-line text-sm text-muted-foreground">{m.body}</p>
                {m.linkUrl && (
                  <a
                    href={m.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-violet-400 underline underline-offset-2"
                  >
                    {m.linkLabel ?? "Read more"} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(m.id)}
              aria-label={m.title ? `Dismiss: ${m.title}` : "Dismiss this notice"}
              className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
