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
import { afterOptions, FOUNDER_CODES, founderAmountOff, founderOffer, founderPercentOff } from "../src/lib/comp-presets";
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

const plansWithRates = ["artist_pro", "pro", "label"] as const;

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

    // --- "what they pay after" presets ---
    // The founding rates differ per plan, and the artist rate must never be offered for a label.
    const proAfter = afterOptions("artist_pro");
    check("Artist Pro offers the A$17 founding rate first", proAfter[0] === "A$17/mo, and that price held for 24 months", proAfter[0]);
    check("Artist Pro quotes its own normal price", proAfter.some((o) => o.includes("A$25/mo")), proAfter.join(" | "));

    const labelAfter = afterOptions("label");
    check("Label offers A$55, not the artist rate", labelAfter[0] === "A$55/mo, and that price held for 24 months", labelAfter[0]);
    check("Label never offers A$17", !labelAfter.some((o) => o.includes("A$17")), labelAfter.join(" | "));

    const smallLabel = afterOptions("pro");
    check("Pro offers A$19", smallLabel[0] === "A$19/mo, and that price held for 24 months", smallLabel[0]);
    check("Pro never offers A$17", !smallLabel.some((o) => o.includes("A$17")), smallLabel.join(" | "));

    check("no plan, no options", afterOptions("none").length === 0);

    // --- founding offer deadline ---
    check("no founding price, no offer", founderOffer({ founderPrice: null, founderOfferUntil: null, founderCode: null }) === null);
    const open = founderOffer({ founderPrice: "A$17/mo", founderOfferUntil: future, founderCode: "FOUNDING" });
    check("an offer inside its window is claimable", open?.expired === false && open?.code === "FOUNDING");
    const gone = founderOffer({ founderPrice: "A$17/mo", founderOfferUntil: past, founderCode: "FOUNDING" });
    check("an offer past its date reads as expired", gone?.expired === true);
    check("an expired offer still reports the price, so the page can explain it", gone?.price === "A$17/mo");
    const forever = founderOffer({ founderPrice: "A$17/mo", founderOfferUntil: null, founderCode: null });
    check("no deadline never expires", forever?.expired === false && forever?.until === null);

    // --- Stripe coupon spec ---
    // amount_off must land exactly on the rate we're telling people, per plan.
    check("Artist Pro coupon is A$8 off (25 → 17)", founderAmountOff("artist_pro") === 8, String(founderAmountOff("artist_pro")));
    // Founders go on Artist Pro. Plain Artist must offer no rate and no code, or the dropdown
    // would name a Stripe coupon that was never created.
    check("plain Artist has no founding rate", founderAmountOff("artist") === null, String(founderAmountOff("artist")));
    check("plain Artist has no founding code", !FOUNDER_CODES.artist, String(FOUNDER_CODES.artist));
    check("Artist offers no locked-price option", !afterOptions("artist").some((o) => o.includes("price held")), afterOptions("artist").join(" | "));
    check("Pro coupon is A$10 off (29 → 19)", founderAmountOff("pro") === 10, String(founderAmountOff("pro")));
    check("Label coupon is A$24 off (79 → 55)", founderAmountOff("label") === 24, String(founderAmountOff("label")));
    check("free has no coupon to make", founderAmountOff("free") === null);

    // percent_off is what actually goes in Stripe. It must land on the exact monthly rate, and
    // stay sane on the yearly price of the same product — which is why it isn't a fixed amount.
    const PCT: [("artist_pro" | "pro" | "label"), number, number, number][] = [
      ["artist_pro", 32, 25, 17],
      ["pro", 34.48, 29, 19],
      ["label", 30.38, 79, 55],
    ];
    for (const [plan, pct, normal, rate] of PCT) {
      check(`${plan} coupon is ${pct}% off`, founderPercentOff(plan) === pct, String(founderPercentOff(plan)));
      check(`${plan} at ${pct}% bills A$${rate}/mo`, Math.round(normal * (1 - pct / 100) * 100) / 100 === rate,
        String(Math.round(normal * (1 - pct / 100) * 100) / 100));
    }
    check("plain Artist has no percentage either", founderPercentOff("artist") === null);
    check("every plan with a rate has its own code", plansWithRates.every((p) => !!FOUNDER_CODES[p]));
    check("codes are distinct per plan", new Set(Object.values(FOUNDER_CODES)).size === Object.values(FOUNDER_CODES).length);
    check("free has no founding rate to quote", !afterOptions("free").some((o) => o.includes("price held")), afterOptions("free").join(" | "));

    // There is no minimum term, so nothing offered here may imply one.
    for (const p of ["artist", "artist_pro", "pro", "label"] as const) {
      check(`${p} never implies a lock-in`, !afterOptions(p).some((o) => /locked (in|for)|minimum term|commit/i.test(o)), afterOptions(p).join(" | "));
    }
  } finally {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
