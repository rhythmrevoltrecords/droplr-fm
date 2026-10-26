import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { promoStepsFor, stepDate } from "@/lib/promo";
import { ASSIGNEE_LABEL, CLASH_ARTIST_DAYS, clashSentence, findClashes, isAssignee, TASK_LIMITS } from "@/lib/release-tasks";
import { zonedDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

const MONTHS = 2;

/** "2026-11" for the month containing `day` ("2026-11-14"), or the next/previous one. */
const monthOf = (day: string) => day.slice(0, 7);
function shiftMonth(m: string, by: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

type Entry =
  | { kind: "release"; id: string; title: string; artist: string; cover: string; download: boolean; clashes: string[] }
  | { kind: "task"; releaseId: string; releaseTitle: string; title: string; assignee: string; done: boolean };

/**
 * Every release on the account in date order, with the tasks and assigned steps that fall due
 * around them. Read-only and on every plan: knowing two releases collide is worth more than
 * anything else on this page, and it costs nothing to show.
 */
export default async function CalendarPage(props: { searchParams: Promise<{ m?: string }> }) {
  const sp = await props.searchParams;
  const user = await requireUser("label");
  const tz = user.organization.timezone;
  const todayDay = zonedDay(new Date(), tz);
  const first = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : monthOf(todayDay);
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(first, i));
  const startDay = `${months[0]}-01`;
  const endDay = `${shiftMonth(first, MONTHS)}-01`;

  // Tasks can sit up to a year from their release, so look that far either side for releases whose plan lands here.
  const span = (Math.max(-TASK_LIMITS.minDay, TASK_LIMITS.maxDay) + 2) * 86_400_000;
  const releases = await prisma.release.findMany({
    where: { organizationId: user.organizationId, releaseDate: { gte: new Date(Date.parse(`${startDay}T00:00:00Z`) - span), lt: new Date(Date.parse(`${endDay}T00:00:00Z`) + span) } },
    select: {
      id: true, title: true, artistName: true, artistProfileId: true, coverUrl: true, releaseDate: true, kind: true,
      tasks: { select: { title: true, day: true, assignee: true, doneAt: true } },
      promoAssigns: { select: { key: true, assignee: true } },
      promoDone: { select: { key: true } },
    },
    orderBy: { releaseDate: "asc" },
    take: 1000,
  });
  const clashes = findClashes(releases, tz);
  const kind = user.organization.kind === "artist" ? "artist" : "label";

  const byDay = new Map<string, Entry[]>();
  const put = (day: string, e: Entry) => { if (day >= startDay && day < endDay) byDay.set(day, [...(byDay.get(day) ?? []), e]); };
  for (const r of releases) {
    put(zonedDay(r.releaseDate, tz), { kind: "release", id: r.id, title: r.title, artist: r.artistName, cover: r.coverUrl, download: r.kind === "download", clashes: (clashes.get(r.id) ?? []).map(clashSentence) });
    for (const t of r.tasks) {
      put(zonedDay(stepDate(r.releaseDate, tz, t.day), tz), { kind: "task", releaseId: r.id, releaseTitle: r.title, title: t.title, assignee: isAssignee(t.assignee) ? ASSIGNEE_LABEL[t.assignee] : "Label", done: !!t.doneAt });
    }
    // Built-in steps only once someone has assigned them; all seventeen of every release would bury the page.
    const steps = new Map(promoStepsFor(kind, r.kind).map((s) => [s.key, s]));
    const done = new Set(r.promoDone.map((d) => d.key));
    for (const a of r.promoAssigns) {
      const s = steps.get(a.key);
      if (!s || !isAssignee(a.assignee)) continue;
      put(zonedDay(stepDate(r.releaseDate, tz, s.day), tz), { kind: "task", releaseId: r.id, releaseTitle: r.title, title: s.title, assignee: ASSIGNEE_LABEL[a.assignee], done: done.has(s.key) });
    }
  }
  const clashCount = [...clashes.keys()].filter((id) => releases.some((r) => r.id === id && zonedDay(r.releaseDate, tz) >= startDay && zonedDay(r.releaseDate, tz) < endDay)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every release{kind === "label" ? " across the roster" : ""}, and the tasks due around them. Two releases on the same day, or the same artist twice inside {CLASH_ARTIST_DAYS} days, are flagged. Dates are in {user.organization.locationLabel} time.
          </p>
        </div>
        <nav aria-label="Months" className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/admin/calendar?m=${shiftMonth(first, -1)}`}>Previous</Link></Button>
          <Button asChild size="sm" variant="ghost"><Link href="/admin/calendar">This month</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/admin/calendar?m=${shiftMonth(first, 1)}`}>Next</Link></Button>
        </nav>
      </div>

      {clashCount > 0 && (
        <Card role="status" className="border-amber-500/40 bg-amber-500/[0.08] p-4 text-sm">
          {clashCount === 1 ? "One release here is" : `${clashCount} releases here are`} close to another. Each is marked below.
        </Card>
      )}

      {months.map((m) => {
        const days = [...byDay.keys()].filter((d) => monthOf(d) === m).sort();
        return (
          <section key={m} aria-labelledby={`m-${m}`} className="space-y-3">
            <h2 id={`m-${m}`} className="text-lg font-semibold">{monthLabel(m)}</h2>
            {!days.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing out and nothing due.</p>}
            <ol className="space-y-2">
              {days.map((d) => (
                <li key={d} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[5.5rem_1fr] ${d === todayDay ? "border-violet-500/60" : ""}`}>
                  <div className="text-sm font-medium tabular-nums">{dayLabel(d)}{d === todayDay && <span className="block text-xs font-normal text-violet-400">Today</span>}</div>
                  <ul className="space-y-2">
                    {byDay.get(d)!.map((e, i) => e.kind === "release" ? (
                      <li key={`r-${e.id}`} className="flex gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={e.cover} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/admin/releases/${e.id}`} className="font-medium hover:underline">{e.title}</Link>
                            <span className="text-sm text-muted-foreground">{e.artist}</span>
                            {e.download ? <Badge variant="secondary">Download gate</Badge> : <Badge>Out</Badge>}
                            {e.clashes.length > 0 && <Badge variant="warning">Clash</Badge>}
                          </div>
                          {e.clashes.map((c) => <p key={c} className="text-xs text-amber-400">{c}</p>)}
                        </div>
                      </li>
                    ) : (
                      <li key={`t-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className={e.done ? "text-muted-foreground line-through" : ""}>{e.title}</span>
                        <Link href={`/admin/releases/${e.releaseId}?tab=promo`} className="text-xs text-muted-foreground hover:underline">{e.releaseTitle}</Link>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{e.assignee}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
