import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsCancel } from "@/components/admin/news-cancel";
import { NewsComposer } from "@/components/admin/news-composer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { countryName } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { canSendNews, localSendWindow } from "@/lib/news";
import { newsOptions } from "@/lib/news-options";
import { platformMeta } from "@/lib/platforms";
import { formatInTz } from "@/lib/time";
import { fmtNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fan email" };

export default async function NewsDetail(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser("label");
  const org = user.organization;
  const news = await prisma.newsEmail.findFirst({ where: { id, organizationId: org.id } });
  if (!news) notFound();

  const back = (
    <Link href="/admin/news" className="text-sm text-muted-foreground underline">
      ← All fan emails
    </Link>
  );

  // A draft is still editable; anything past that is a record of what fans were told.
  if (news.status === "draft") {
    if (!canSendNews(org.plan)) notFound();
    const opts = await newsOptions(org.id);
    return (
      <div className="space-y-5">
        {back}
        <h1 className="text-2xl font-semibold">Edit fan email</h1>
        <NewsComposer
          draft={{
            id: news.id,
            subject: news.subject,
            body: news.body,
            buttonLabel: news.buttonLabel ?? "",
            buttonUrl: news.buttonUrl ?? "",
            filterCountry: news.filterCountry ?? "",
            filterListenOn: news.filterListenOn ?? "",
            filterReleaseId: news.filterReleaseId ?? "",
          }}
          orgName={org.emailFromName || org.name}
          timezone={org.timezone}
          status={news.status}
          {...opts}
        />
      </div>
    );
  }

  const release = news.filterReleaseId
    ? await prisma.release.findFirst({ where: { id: news.filterReleaseId }, select: { title: true, artistName: true } })
    : null;
  const audience = [
    news.filterCountry ? countryName(news.filterCountry) : null,
    news.filterListenOn ? platformMeta(news.filterListenOn).name : null,
    release ? `${release.title} — ${release.artistName}` : null,
  ].filter(Boolean);

  const pending = Math.max(0, news.recipients - news.sent - news.failed);
  const localWindow = localSendWindow(news, org.timezone);
  const fmt = (d: Date) => formatInTz(d, org.timezone, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  // A local send sits on "sending" for up to 26 hours by design. Say so, or it reads as stuck.
  const nextDue = localWindow
    ? await prisma.newsEmailDelivery.findFirst({
        where: { newsEmailId: news.id, sentAt: null, error: null },
        orderBy: { sendAfter: "asc" },
        select: { sendAfter: true },
      })
    : null;

  return (
    <div className="space-y-5">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{news.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {news.status === "scheduled"
              ? localWindow
                ? `${news.localHour}:00 on each fan's own clock — first one leaves ${fmt(localWindow.earliest)} your time, last one ${fmt(localWindow.latest)}`
                : `Scheduled for ${news.scheduledFor ? formatInTz(news.scheduledFor, org.timezone, { dateStyle: "medium", timeStyle: "short" }) : "the next run"}`
              : news.status === "sending"
                ? localWindow
                  ? `Going out at ${news.localHour}:00 in each timezone as it comes round${nextDue?.sendAfter ? `. Next batch ${fmt(nextDue.sendAfter)} your time` : ""}`
                  : "Sending now — this page updates as it goes."
                : news.sentAt
                  ? `Sent ${formatInTz(news.sentAt, org.timezone, { dateStyle: "medium", timeStyle: "short" })}`
                  : news.status}
          </p>
        </div>
        <Badge variant={news.status === "sent" ? "success" : "secondary"}>{news.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Recipients", value: news.recipients },
          { label: "Sent", value: news.sent },
          { label: "Waiting", value: pending },
          { label: "Failed", value: news.failed },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtNum(t.value)}</div>
          </Card>
        ))}
      </div>

      {news.lastError && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4 text-sm text-red-300">{news.lastError}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What you sent</CardTitle>
          <CardDescription>{audience.length ? `Narrowed to: ${audience.join(" · ")}` : "Everyone opted in to news."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{news.body}</p>
          {news.buttonUrl && news.buttonLabel && (
            <p className="text-sm">
              <span className="text-muted-foreground">Button: </span>
              <span className="text-foreground">{news.buttonLabel}</span> → <span className="break-all text-violet-400">{news.buttonUrl}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {news.status === "scheduled" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-muted-foreground">Changed your mind? Cancelling puts it back to a draft.</span>
            <NewsCancel id={news.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
