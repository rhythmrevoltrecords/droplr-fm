import Link from "next/link";
import { notFound } from "next/navigation";
import { Conversation, StatusBadge, categoryLabel } from "@/components/feedback/conversation";
import { FeedbackReply } from "@/components/feedback/feedback-forms";
import { PlatformChrome } from "@/components/platform/platform-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/platform";
import { planOf } from "@/lib/plans";
import { formatInTz } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback · Platform", robots: { index: false, follow: false } };

export default async function PlatformFeedbackThread(props: { params: Promise<{ id: string }> }) {
  const [admin, { id }] = await Promise.all([requirePlatformAdmin(), props.params]);
  const thread = await prisma.feedbackThread.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      user: { select: { email: true, role: true, createdAt: true } },
      organization: { select: { name: true, slug: true, plan: true, kind: true, stripeSubscriptionId: true, compPlan: true, _count: { select: { releases: true } } } },
    },
  });
  if (!thread) notFound();
  // Opening it counts as read; replying is what the user sees.
  if (thread.unreadByTeam) await prisma.feedbackThread.update({ where: { id: thread.id }, data: { unreadByTeam: false } });
  const o = thread.organization;
  const tz = "Australia/Brisbane";
  return (
    <PlatformChrome email={admin.email} active="feedback">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/platform/feedback" className="hover:underline">Feedback</Link> / Conversation</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold">{thread.subject}</h1>
          <StatusBadge status={thread.status} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Card><CardContent className="pt-6"><Conversation messages={thread.messages} side="team" tz={tz} teamName={`droplr.fm team`} /></CardContent></Card>
          <Card>
            <CardHeader><CardTitle>Reply to {thread.user.email}</CardTitle></CardHeader>
            <CardContent><FeedbackReply endpoint={`/api/platform/feedback/${thread.id}`} placeholder="They'll get this by email and see it on their Feedback page" status={thread.status} statusControl /></CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Who</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Email</dt><dd className="break-all">{thread.user.email}</dd>
              <dt className="text-muted-foreground">Role</dt><dd className="capitalize">{thread.user.role}</dd>
              <dt className="text-muted-foreground">Account</dt><dd>{o.name} <span className="text-muted-foreground">/{o.slug}</span></dd>
              <dt className="text-muted-foreground">Type</dt><dd>{o.kind === "artist" ? "Artist" : "Label"}</dd>
              <dt className="text-muted-foreground">Plan</dt><dd>{planOf(o.plan).name}{o.stripeSubscriptionId ? " · Stripe" : o.compPlan ? " · comp" : ""}</dd>
              <dt className="text-muted-foreground">Releases</dt><dd>{o._count.releases}</dd>
              <dt className="text-muted-foreground">Joined</dt><dd>{formatInTz(thread.user.createdAt, tz, { dateStyle: "medium" })}</dd>
              <dt className="text-muted-foreground">Topic</dt><dd>{categoryLabel(thread.category)}</dd>
              {thread.page && <><dt className="text-muted-foreground">Sent from</dt><dd className="break-all font-mono text-xs">{thread.page}</dd></>}
            </dl>
          </CardContent>
        </Card>
      </div>
    </PlatformChrome>
  );
}
