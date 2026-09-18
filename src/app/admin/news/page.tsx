import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fanSummary } from "@/lib/fans";
import { canSendNews } from "@/lib/news";
import { planOf } from "@/lib/plans";
import { formatInTz } from "@/lib/time";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fan emails" };

const STATUS: Record<string, { label: string; variant: "secondary" | "success" | "default" }> = {
  draft: { label: "Draft", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "default" },
  sending: { label: "Sending", variant: "default" },
  sent: { label: "Sent", variant: "success" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  failed: { label: "Failed", variant: "secondary" },
};

export default async function NewsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  const allowed = canSendNews(org.plan);

  const [summary, emails] = await Promise.all([
    fanSummary(org.id),
    prisma.newsEmail.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fan emails</h1>
          <p className="text-sm text-muted-foreground">
            Email the {fmtNum(summary.news)} {summary.news === 1 ? "fan who said" : "fans who said"} yes to news and new music.
          </p>
        </div>
        {allowed && <Button asChild><Link href="/admin/news/new">Write an email</Link></Button>}
      </div>

      {!allowed && (
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardContent className="space-y-2 p-5 text-sm">
            <p className="text-foreground">
              <strong>Fan emails are on the paid plans.</strong> Your {planOf(org.plan).name} account still collects news opt-ins, so nothing is
              lost — {fmtNum(summary.news)} {summary.news === 1 ? "fan is" : "fans are"} already waiting when you upgrade.
            </p>
            <Link href="/admin/settings/billing" className="inline-block text-violet-400 underline">See the plans</Link>
          </CardContent>
        </Card>
      )}

      {allowed && summary.news === 0 && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Nobody has opted in yet. The tick box appears under the pre-save form, so opt-ins build up as fans save your releases.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {emails.map((e) => {
          const s = STATUS[e.status] ?? STATUS.draft;
          const when = e.sentAt ?? e.scheduledFor ?? e.createdAt;
          return (
            <Link key={e.id} href={`/admin/news/${e.id}`} className="block">
              <Card className="p-4 transition-colors hover:border-violet-500/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        s.label,
                        e.status === "sent" ? `${fmtNum(e.sent)} sent` : e.status === "scheduled" ? "waiting" : e.recipients ? `${fmtNum(e.recipients)} recipients` : null,
                        e.failed ? `${fmtNum(e.failed)} failed` : null,
                        formatInTz(when, org.timezone, { dateStyle: "medium", timeStyle: "short" }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              </Card>
            </Link>
          );
        })}
        {!emails.length && allowed && summary.news > 0 && (
          <Card className="py-10 text-center text-sm text-muted-foreground">No emails yet. Write your first one.</Card>
        )}
      </div>
    </div>
  );
}
