/**
 * Importing a fan list you already had.
 *
 * What this defends:
 *  - an imported address can NEVER enter a release-day send. This is the whole reason imported
 *    contacts are their own table: release-day sending reads PreSave scoped to a releaseId, and
 *    an import writes nothing there. If someone ever "simplifies" that, this suite fails;
 *  - an import cannot undo an unsubscribe. Someone who told this label to stop stays stopped,
 *    even if their address is in the file;
 *  - a transactional import (they only gave their email for a download) can't be emailed until
 *    they confirm, while a real marketing opt-in carries over, because consent runs to the
 *    label and not to whichever tool collected it;
 *  - provenance is mandatory: no source, no attestation, no import;
 *  - one label's contacts are invisible to another, including through the news audience;
 *  - the unsubscribe link in a news email works for an imported contact, who has no PreSave row.
 *
 * Local database only. Never point it at Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { extractContacts, isConsentSource, normalizeEmail, parseCsv } from "../src/lib/fan-import";
import { importContacts } from "../src/lib/fan-import-server";
import { newsAudience } from "../src/lib/news";

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
let pass = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { ok ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`${ok ? "  ✓" : "  ✗"} ${n}${!ok && d ? ` (${d})` : ""}`); };

async function makeOrg(tag: string) {
  return prisma.organization.create({ data: { name: `Import ${tag} ${RUN}`, slug: `import-${tag}-${RUN}`, plan: "label" } });
}

async function main() {
  console.log("\n1. Reading the file");
  {
    const csv = 'Email,Name,Country\r\n"Smith, Jo" <JO@Example.com>,Jo,AU\nfan2@example.com,"Doe, Jane",GB\nnot-an-email,x,ZZ\nfan2@example.com,dupe,AU\n';
    const rows = parseCsv(csv);
    check("quoted commas don't split a row", rows.length === 5, `${rows.length} rows`);
    const { contacts, skipped } = extractContacts(rows);
    const emails = contacts.map((c) => c.email);
    check("valid addresses are found", emails.includes("fan2@example.com"));
    check("a junk row is skipped, not guessed at", skipped >= 1, `skipped ${skipped}`);
    check("a duplicate inside the file is collapsed", emails.filter((e) => e === "fan2@example.com").length === 1);
    check("country is kept when it's a real code", contacts.find((c) => c.email === "fan2@example.com")?.country === "GB");
  }
  {
    // A Mailchimp-style export with no header droplr recognises: find the email column anyway.
    const rows = parseCsv("id,addr,joined\n1,a@example.com,2024\n2,b@example.com,2024\n");
    const { contacts } = extractContacts(rows);
    check("an unrecognised header still finds the addresses", contacts.length === 2, `${contacts.length}`);
  }
  {
    check("a BOM doesn't poison the first header", parseCsv("﻿email\nx@example.com\n")[0][0] === "email");
    check("addresses are normalised to lowercase", normalizeEmail("  A@B.COM ") === "a@b.com");
    check("only known sources are accepted", isConsentSource("hypeddit") && !isConsentSource("wherever"));
  }

  console.log("\n2. A marketing opt-in carries over; a download does not");
  const A = await makeOrg("a");
  {
    const r = await importContacts({
      organizationId: A.id, contacts: [{ email: `m1-${RUN}@example.com` }, { email: `m2-${RUN}@example.com` }],
      skipped: 0, consentSource: "hypeddit", consentKind: "marketing",
      consentAt: new Date("2024-03-01"), consentNote: "Tick to get my future releases",
    });
    check("a marketing import adds them", r.added === 2, `added ${r.added}`);
    check("and they're mailable", r.status === "mailable");

    const t = await importContacts({
      organizationId: A.id, contacts: [{ email: `t1-${RUN}@example.com` }],
      skipped: 0, consentSource: "hypeddit", consentKind: "transactional",
      consentAt: null, consentNote: "Just entered an email to download",
    });
    check("a download-only import is NOT mailable", t.status === "pending");
    const row = await prisma.fanContact.findFirst({ where: { organizationId: A.id, email: `t1-${RUN}@example.com` } });
    check("it's stored as pending", row?.status === "pending", row?.status);
    check("what they agreed to is kept verbatim", row?.consentNote === "Just entered an email to download");
    check("and where it came from", row?.consentSource === "hypeddit");
  }

  console.log("\n3. An import can't touch a release-day send");
  {
    const before = await prisma.preSave.count();
    await importContacts({
      organizationId: A.id, contacts: [{ email: `rd-${RUN}@example.com` }],
      skipped: 0, consentSource: "own-site", consentKind: "marketing", consentAt: null, consentNote: "signed up on my site",
    });
    const after = await prisma.preSave.count();
    check("importing creates ZERO PreSave rows", before === after, `${before} → ${after}`);

    // The release-day pipeline reads PreSave scoped to a releaseId. Prove the address is absent.
    const rel = await prisma.release.create({
      data: { organizationId: A.id, title: `RD ${RUN}`, artistName: "X", slug: `rd-${RUN}`, coverUrl: "https://x/c.jpg", releaseDate: new Date(Date.now() + 86400_000), isPublic: true },
    });
    const wouldSend = await prisma.preSave.findMany({ where: { releaseId: rel.id, platform: "email" } });
    check("a new release's send list is empty despite the import", wouldSend.length === 0, `${wouldSend.length}`);
  }

  console.log("\n4. An import never undoes an unsubscribe");
  {
    const rel = await prisma.release.create({
      data: { organizationId: A.id, title: `Unsub ${RUN}`, artistName: "X", slug: `unsub-${RUN}`, coverUrl: "https://x/c.jpg", releaseDate: new Date(), isPublic: true },
    });
    const quitter = `quit-${RUN}@example.com`;
    await prisma.preSave.create({ data: { releaseId: rel.id, platform: "email", email: quitter, status: "unsubscribed", emailConsent: false } });
    const r = await importContacts({
      organizationId: A.id, contacts: [{ email: quitter }], skipped: 0,
      consentSource: "hypeddit", consentKind: "marketing", consentAt: null, consentNote: "old opt-in",
    });
    check("someone who unsubscribed is refused", r.suppressed === 1, `suppressed ${r.suppressed}`);
    check("and not added", r.added === 0, `added ${r.added}`);
    check("no contact row exists for them", (await prisma.fanContact.count({ where: { organizationId: A.id, email: quitter } })) === 0);
  }

  console.log("\n5. An existing fan keeps their real record");
  {
    const rel = await prisma.release.create({
      data: { organizationId: A.id, title: `Fan ${RUN}`, artistName: "X", slug: `fan-${RUN}`, coverUrl: "https://x/c.jpg", releaseDate: new Date(), isPublic: true },
    });
    const real = `real-${RUN}@example.com`;
    await prisma.preSave.create({ data: { releaseId: rel.id, platform: "email", email: real, status: "completed", emailConsent: true, newsConsent: true } });
    const r = await importContacts({
      organizationId: A.id, contacts: [{ email: real }], skipped: 0,
      consentSource: "hypeddit", consentKind: "marketing", consentAt: null, consentNote: "old opt-in",
    });
    check("an existing pre-save fan isn't duplicated", r.alreadyFans === 1 && r.added === 0, `fans ${r.alreadyFans} added ${r.added}`);

    const again = await importContacts({
      organizationId: A.id, contacts: [{ email: `m1-${RUN}@example.com` }], skipped: 0,
      consentSource: "hypeddit", consentKind: "marketing", consentAt: null, consentNote: "again",
    });
    check("re-importing the same file adds nobody twice", again.duplicates === 1 && again.added === 0);
  }

  console.log("\n6. The news audience");
  {
    const rows = await newsAudience(A.id, {});
    const emails = rows.map((r) => r.email);
    check("a mailable import is reachable by a news email", emails.includes(`m1-${RUN}@example.com`));
    check("a pending import is NOT", !emails.includes(`t1-${RUN}@example.com`));
    check("an unsubscriber is NOT", !emails.includes(`quit-${RUN}@example.com`));
    check("an imported row carries a contact id for its unsubscribe link", !!rows.find((r) => r.email === `m1-${RUN}@example.com`)?.fanContactId);
    check("a real fan still carries a pre-save id", !!rows.find((r) => r.email === `real-${RUN}@example.com`)?.preSaveId);
    check("nobody appears twice", new Set(emails).size === emails.length);

    // Filtering by release is about pre-save history, which an imported contact has none of.
    const relRows = await newsAudience(A.id, { releaseId: "nope" });
    check("a release-filtered send excludes imports rather than guessing", !relRows.some((r) => r.fanContactId));
  }

  console.log("\n7. One label can't see another's contacts");
  {
    const B = await makeOrg("b");
    await importContacts({
      organizationId: B.id, contacts: [{ email: `bsecret-${RUN}@example.com` }], skipped: 0,
      consentSource: "own-site", consentKind: "marketing", consentAt: null, consentNote: "B's list",
    });
    const aRows = await newsAudience(A.id, {});
    check("B's contacts are absent from A's audience", !aRows.map((r) => r.email).includes(`bsecret-${RUN}@example.com`));
    const aContacts = await prisma.fanContact.findMany({ where: { organizationId: A.id } });
    check("and absent from A's contact list", !aContacts.some((c) => c.email.startsWith("bsecret-")));

    // The same address on both labels is two separate consents, and must stay separate.
    const shared = `shared-${RUN}@example.com`;
    await importContacts({ organizationId: A.id, contacts: [{ email: shared }], skipped: 0, consentSource: "own-site", consentKind: "marketing", consentAt: null, consentNote: "A" });
    await importContacts({ organizationId: B.id, contacts: [{ email: shared }], skipped: 0, consentSource: "own-site", consentKind: "marketing", consentAt: null, consentNote: "B" });
    const both = await prisma.fanContact.findMany({ where: { email: shared } });
    check("the same address on two labels is two separate records", both.length === 2, `${both.length}`);
    await prisma.fanContact.updateMany({ where: { email: shared, organizationId: A.id }, data: { status: "unsubscribed" } });
    const bRows = await newsAudience(B.id, {});
    check("unsubscribing from A doesn't unsubscribe them from B", bRows.map((r) => r.email).includes(shared));
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
