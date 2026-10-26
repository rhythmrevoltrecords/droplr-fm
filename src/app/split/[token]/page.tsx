import type { Metadata } from "next";
import { SplitAnswer } from "@/components/public/split-answer";
import { bpsToPercent, partyState, ROLE_LABEL, type Role } from "@/lib/royalties";
import { partyByToken } from "@/lib/royalties-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Split sheet", robots: { index: false, follow: false } };

/**
 * What a collaborator sees from the email: the release, everyone's name, role and share — never
 * anyone's email address — and two buttons. Opening it changes nothing.
 */
export default async function SplitPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const pt = await partyByToken(token);
  if (!pt) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-sm text-white/70">Split sheet links last 30 days, and a new one replaces the last. Ask the label to send it again.</p>
      </main>
    );
  }
  const s = pt.sheet, r = s.release;
  const mine = partyState(pt, s.version);
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.coverUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
        <div>
          <p className="text-sm text-white/70">Split sheet from {r.organization.name}</p>
          <h1 className="text-xl font-semibold">{r.title}</h1>
          <p className="text-sm text-white/70">{r.artistName}</p>
        </div>
      </div>
      <p className="text-sm">Hi {pt.name}. Here is how this release&apos;s income from the distributor is shared. Check your line and everyone else&apos;s.</p>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-white/10 text-left text-white/70"><th className="py-2 font-medium">Name</th><th className="py-2 font-medium">Role</th><th className="py-2 text-right font-medium">Share</th></tr></thead>
        <tbody>
          {s.parties.map((x) => (
            <tr key={x.id} className={`border-b border-white/5 ${x.id === pt.id ? "font-semibold" : ""}`}>
              <td className="py-2">{x.name}{x.id === pt.id ? " (you)" : ""}</td>
              <td className="py-2 text-white/70">{ROLE_LABEL[x.role as Role] ?? x.role}</td>
              <td className="py-2 text-right tabular-nums">{bpsToPercent(x.shareBps)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SplitAnswer token={token} version={s.version} initial={mine === "confirmed" ? "confirmed" : mine === "disputed" ? "disputed" : null} />
      <p className="text-xs text-white/60">droplr.fm keeps track of who is owed what for {r.organization.name}. It never holds or pays money: the label pays you directly, under whatever agreement you have with them. Confirming here says the shares above are right. It isn&apos;t a contract.</p>
    </main>
  );
}
