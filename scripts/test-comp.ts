/**
 * Complimentary plans: expiry, the lapse sweep, and the two dashboard notices.
 *
 * What this defends:
 *  - a comp past its end date grants nothing, even before the sweep runs;
 *  - the sweep drops a lapsed account to what it actually pays for, and keeps compPlan so the
 *    dashboard can still explain what happened;
 *  - each grant raises its notice once, and a later comp raises its own.
 *
 * Local database only. Never point it at Neon.
 */
import { prisma } from "../src/lib/db";
import { effectiveComp, storedPlan, sweepLapsedComps } from "../src/lib/billing";
import { compNoticeFor } from "../src/lib/plan-copy";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    host = raw;
  }
  if (host.includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run: ${name} points at ${host} (production).`);
    process.exit(1);
  }
}

let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { ok ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`${ok ? "  ✓" : "  ✗"} ${n}${!ok && d ? ` (${d})` : ""}`); };

const future = new Date(Date.now() + 60 * 86400000);
const past = new Date(Date.now() - 86400000);

async function main() {
  const org = await prisma.organization.create({ data: { name: "Comp Test", slug: `comp-test-${Date.now()}`, plan: "free", kind: "artist", timezone: "Australia/Brisbane" } });
  try {
    // --- effectiveComp ---
    check("no comp grants nothing", effectiveComp({ compPlan: null, compUntil: null }) === null);
    check("comp with no end date grants", effectiveComp({ compPlan: "artist_pro", compUntil: null }) === "artist_pro");
    check("comp ending in future grants", effectiveComp({ compPlan: "artist_pro", compUntil: future }) === "artist_pro");
    check("lapsed comp grants nothing", effectiveComp({ compPlan: "artist_pro", compUntil: past }) === null);

    const base = { stripeSubscriptionId: null, stripePriceId: null };
    check("storedPlan lifts to a running comp", storedPlan({ ...base, compPlan: "artist_pro", compUntil: future }) === "artist_pro");
    check("storedPlan ignores a lapsed comp", storedPlan({ ...base, compPlan: "artist_pro", compUntil: past }) === "free",
      storedPlan({ ...base, compPlan: "artist_pro", compUntil: past }));

    // --- sweep ---
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "artist_pro", compPlan: "artist_pro", compUntil: past, compSetAt: new Date(Date.now() - 90 * 86400000) } });
    await sweepLapsedComps();
    const swept = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    check("sweep drops a lapsed account to free", swept.plan === "free", swept.plan);
    check("sweep keeps compPlan so the notice can explain", swept.compPlan === "artist_pro");

    await prisma.organization.update({ where: { id: org.id }, data: { plan: "artist_pro", compUntil: future } });
    await sweepLapsedComps();
    check("sweep leaves a running comp alone", (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan === "artist_pro");

    // --- notices ---
    const setAt = new Date();
    const granted = { compPlan: "artist_pro", compSetAt: setAt, compUntil: future, compNoticeAt: null, compEndedNoticeAt: null };
    check("a fresh comp shows the granted notice", compNoticeFor(granted) === "granted");
    check("acknowledging the grant clears it", compNoticeFor({ ...granted, compNoticeAt: setAt }) === null);

    const lapsedOrg = { compPlan: "artist_pro", compSetAt: setAt, compUntil: past, compNoticeAt: setAt, compEndedNoticeAt: null };
    check("a lapsed comp shows the ended notice", compNoticeFor(lapsedOrg) === "ended");
    check("acknowledging the ending clears it", compNoticeFor({ ...lapsedOrg, compEndedNoticeAt: past }) === null);
    check("an acknowledged grant still raises the ending later", compNoticeFor({ ...granted, compNoticeAt: setAt, compUntil: past }) === "ended");

    const newer = new Date(Date.now() + 1000);
    check("a second comp raises its own notice", compNoticeFor({ ...granted, compSetAt: newer, compNoticeAt: setAt }) === "granted");
    check("no comp, no notice", compNoticeFor({ compPlan: null, compSetAt: null, compUntil: null, compNoticeAt: null, compEndedNoticeAt: null }) === null);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
