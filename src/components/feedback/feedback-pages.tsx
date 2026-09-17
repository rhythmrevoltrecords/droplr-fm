import Link from "next/link";
import { notFound } from "next/navigation";
import { Conversation, StatusBadge, categoryLabel } from "@/components/feedback/conversation";
import { FeedbackReply, NewFeedbackForm } from "@/components/feedback/feedback-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { safePage } from "@/lib/feedback";
import { timeAgo } from "@/lib/utils";

type Viewer = { id: string; organizationId: string; organization: { timezone: string } };

/** /admin/feedback and /dashboard/feedback: start a conversation, see your past ones. */
export async function FeedbackListPage({ user, base, from }: { user: Viewer; base: string; from?: string }) {
  const threads = await prisma.feedbackThread.findMany({
    where: { userId: user.id, organizationId: user.organizationId },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground">Tell the droplr.fm team what&apos;s working and what isn&apos;t. A real person reads every message and replies here; you&apos;ll get an email when they do.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>New message</CardTitle></CardHeader>
        <CardContent><NewFeedbackForm from={safePage(from)} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your conversations</CardTitle>{!threads.length && <CardDescription>Nothing yet.</CardDescription>}</CardHeader>
        {threads.length > 0 && (
          <CardContent className="space-y-1 px-2">
            {threads.map((t) => (
              <Link key={t.id} href={`${base}/${t.id}`} className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-secondary/60">
                {t.unreadByUser ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" aria-label="New reply" /> : <span className="h-2.5 w-2.5 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${t.unreadByUser ? "font-semibold" : "font-medium"}`}>{t.subject}</span>
                  <span className="block text-xs text-muted-foreground">{categoryLabel(t.category)} · {t._count.messages} message{t._count.messages === 1 ? "" : "s"} · {timeAgo(t.lastMessageAt)}</span>
                </span>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export async function FeedbackThreadPage({ user, base, id }: { user: Viewer; base: string; id: string }) {
  const thread = await prisma.feedbackThread.findFirst({ where: { id, userId: user.id, organizationId: user.organizationId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!thread) notFound();
  if (thread.unreadByUser) await prisma.feedbackThread.update({ where: { id: thread.id }, data: { unreadByUser: false } });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href={base} className="hover:underline">Feedback</Link> / Conversation</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold">{thread.subject}</h1>
          <StatusBadge status={thread.status} />
        </div>
        <p className="text-sm text-muted-foreground">{categoryLabel(thread.category)}{thread.page ? ` · sent from ${thread.page}` : ""}</p>
      </div>
      <Card><CardContent className="pt-6"><Conversation messages={thread.messages} side="user" tz={user.organization.timezone} /></CardContent></Card>
      <Card>
        <CardHeader>
          <CardTitle>Reply</CardTitle>
          {thread.status === "closed" && <CardDescription>This conversation was closed. Replying opens it again.</CardDescription>}
        </CardHeader>
        <CardContent><FeedbackReply endpoint={`/api/feedback/${thread.id}`} placeholder="Add more detail or answer the team's question" /></CardContent>
      </Card>
    </div>
  );
}
