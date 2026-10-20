/**
 * Who gets pushed to a connected Mailchimp.
 *
 * `espAudience` had no test of any kind. It is the function that hands a fan's address to a third
 * party, and once it has done that droplr cannot take it back — which makes it the worst place in
 * the codebase for an opt-out to be missed.
 *
 * The rule: an opt-out is to the ACCOUNT, not to a table or a platform. If a fan told this label
 * to stop, nothing may push them anywhere, whichever row they happen to live in.
 *
 * Runs against the local database. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { espAudience, espAudienceCount } from "../src/lib/esp/audience";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  const raw = process.env[name];
  if (!raw) continue;
  let host = "";
  try { host = new URL(raw).hostname; } catch { host = raw; }
  if (host.includes("neon.tech") && process.env.ALLOW_PROD_TEST !== "1") {
    console.error(`Refusing to run: ${name} points at ${host} (production).`);
    process.exit(1);
  }
}

const RUN = randomBytes(3).toString("hex");
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

async function main() {
  console.log(`ESP audience tests (run ${RUN})`);
  const org = await prisma.organization.create({
    data: { name: `Esp ${RUN}`, slug: `esp-${RUN}`, plan: "label", timezone: "Australia/Brisbane" },
  });
  const other = await prisma.organization.create({
    data: { name: `EspB ${RUN}`, slug: `esp-b-${RUN}`, plan: "label", timezone: "Australia/Brisbane" },
  });
  const rel = await prisma.release.create({
    data: { organizationId: org.id, slug: `esp-rel-${RUN}`, title: "T", artistName: "A",
            coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86400_000), rollout: "local" },
  });
  const relOther = await prisma.release.create({
    data: { organizationId: other.id, slug: `esp-rel-b-${RUN}`, title: "T", artistName: "A",
            coverUrl: "https://example.com/c.jpg", releaseDate: new Date(Date.now() - 86400_000), rollout: "local" },
  });

  const e = (tag: string) => `esp-${tag}-${RUN}@fans.dev`;
  const ps = (email: string, over: Record<string, unknown> = {}) => ({
    releaseId: rel.id, platform: "email", email, emailConsent: true, consentAt: new Date(), ...over,
  });
  const fc = (email: string, over: Record<string, unknown> = {}) => ({
    organizationId: org.id, email, consentSource: "hypeddit", consentKind: "marketing",
    status: "mailable", importId: `imp-${RUN}`, ...over,
  });
  const captured = (email: string, over: Record<string, unknown> = {}) =>
    fc(email, { consentSource: "bio", importId: null, consentAt: new Date(), consentVersion: "t", ...over });

  try {
    await prisma.preSave.createMany({ data: [
      ps(e("news"), { newsConsent: true, newsConsentAt: new Date(), country: "AU" }),
      ps(e("releaseonly"), { newsConsent: false }),
      ps(e("gone"), { newsConsent: true, newsConsentAt: new Date(), status: "unsubscribed", emailConsent: false }),
      // The shape an unsubscribe leaves when the fan only ever pre-saved through Spotify or
      // Deezer: the unsubscribe route writes `status: "unsubscribed"` onto `platform: "email"`
      // rows only, so there is no unsubscribed row anywhere — just consent withdrawn.
      { releaseId: rel.id, platform: "spotify", email: e("spotifygone"), emailConsent: false, newsConsent: false, consentAt: new Date() },
      { releaseId: relOther.id, platform: "email", email: e("otherlabel"), emailConsent: true, newsConsent: true, newsConsentAt: new Date() },
      // Both a pre-saver who ticked news AND a contact row, so the merge branch actually runs.
      ps(e("both"), { newsConsent: true, newsConsentAt: new Date(), country: "GB" }),
    ] });
    await prisma.fanContact.createMany({ data: [
      fc(e("import")),
      fc(e("importpending"), { status: "pending", consentKind: "transactional" }),
      fc(e("importgone"), { status: "unsubscribed" }),
      captured(e("bio")),
      // Both of these ALSO have a pre-save that says stop. A contact row saying "mailable" must
      // not win over that.
      fc(e("gone")),
      captured(e("spotifygone")),
      // The same address as a pre-saver above. One person, one push.
      fc(e("both"), { name: "Both Ways" }),
      // Another account's contact. Nothing here may ever reach this org's Mailchimp.
      fc(e("otherlabelcontact"), { organizationId: other.id }),
    ] });

    const aud = await espAudience(org.id);
    const emails = aud.map((r) => r.email).sort();
    const has = (tag: string) => emails.includes(e(tag));

    check("a fan who ticked news is pushed", has("news"));
    check("a confirmed import is pushed", has("import"));
    check("someone who subscribed on a bio page is pushed", has("bio"),
      "page captures are FanContact rows too, and have been syncing since the subscribe box shipped");

    check("a release-only pre-save is never pushed", !has("releaseonly"));
    check("an unconfirmed import is never pushed", !has("importpending"));
    check("an unsubscribed contact is never pushed", !has("importgone"));
    check("someone who unsubscribed is never pushed, even with a mailable contact row", !has("gone"));
    // THE ONE THIS SUITE WAS WRITTEN FOR.
    check("…and that holds when the opt-out left no 'unsubscribed' row behind", !has("spotifygone"),
      "a Spotify-only pre-saver's unsubscribe writes emailConsent=false and no status row; lib/fan-consent is the only thing that knows that counts");

    check("another label's pre-savers are never pushed", !has("otherlabel"));
    check("another label's contacts are never pushed", !has("otherlabelcontact"),
      "the contact query is scoped by organizationId and nothing downstream would notice if it stopped being");
    check("one row per address", new Set(emails).size === emails.length);
    check("the count agrees with the list", (await espAudienceCount(org.id)) === aud.length);
    check("an address that is both a pre-save and a contact is pushed once",
      emails.filter((x) => x === e("both")).length === 1,
      String(emails.filter((x) => x === e("both")).length));
    check("…and the contact's name fills the gap the pre-save left",
      aud.find((r) => r.email === e("both"))?.name === "Both Ways",
      String(aud.find((r) => r.email === e("both"))?.name));
    check("…without the contact overwriting what the pre-save knew",
      aud.find((r) => r.email === e("both"))?.country === "GB");
    check("country survives the merge", aud.find((r) => r.email === e("news"))?.country === "AU");
  } finally {
    await prisma.organization.deleteMany({ where: { slug: { in: [org.slug, other.slug] } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e2) => { console.error(e2); process.exit(1); });
