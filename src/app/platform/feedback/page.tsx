import Link from "next/link";
import { StatusBadge, categoryLabel } from "@/components/feedback/conversation";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { planOf } from "@/lib/plans";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback · Platform", robots: { index: false, follow: false } };

const FILTERS = [["open", "Open"], ["unread", "Needs reply"], ["closed", "Closed"], ["all", "All"]] as const;

export default async function PlatformFeedback(props: { searchParams: Promise<{ show?: string }> }) {
  const [admin, sp] = await Promise.all([requirePlatformAdmin(), props.searchParams]);
  const show = FILTERS.some(([k]) => k === sp.show) ? sp.show! : "open";
  const where = show === "unread" ? { unreadByTeam: true } : show === "open" ? { status: "open" } : show === "closed" ? { status: "closed" } : {};
  const threads = await prisma.feedbackThread.findMany({
    where,
    orderBy: [{ unreadByTeam: "desc" }, { lastMessageAt: "desc" }],
    take: 200,
    include: {
      user: { select: { email: true, role: true } },
      organization: { select: { name: true, plan: true, kind: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, fromTeam: true } },
    },
  });
  return (
    <PlatformChrome email={admin.email} active="feedback">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="text-sm text-muted-foreground">Conversations from the Feedback button. People get an email when you reply.</p>
        </div>
        <nav className="inline-flex rounded-lg border p-1 text-sm">
          {FILTERS.map(([k, l]) => (
            <Link key={k} href={`/platform/feedback?show=${k}`} className={`rounded-md px-3 py-1.5 ${show === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</Link>
          ))}
        </nav>
      </div>
      <Card className="divide-y p-0">
        {threads.map((t) => {
          const last = t.messages[0];
          return (
            <Link key={t.id} href={`/platform/feedback/${t.id}`} className="flex min-w-0 items-start gap-3 px-4 py-3 hover:bg-secondary/40">
              {t.unreadByTeam ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" aria-label="Needs reply" /> : <span className="mt-1.5 h-2.5 w-2.5 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={`truncate text-sm ${t.unreadByTeam ? "font-semibold" : "font-medium"}`}>{t.subject}</span>
                  <Badge variant="secondary">{categoryLabel(t.category)}</Badge>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.user.email} · {t.organization.name} ({t.organization.kind === "artist" ? "artist" : "label"}, {planOf(t.organization.plan).name}) · {timeAgo(t.lastMessageAt)}
                </span>
                {last && <span className="mt-1 block truncate text-sm text-muted-foreground">{last.fromTeam ? "You: " : ""}{last.body}</span>}
              </span>
              <StatusBadge status={t.status} />
            </Link>
          );
        })}
        {!threads.length && <p className="p-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
      </Card>
    </PlatformChrome>
  );
}
