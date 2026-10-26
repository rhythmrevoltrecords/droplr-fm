/**
 * Royalties and splits.
 *
 * What these defend:
 *  - money is exact: amounts are summed and split in integers, and a release's parts always add
 *    up to the release's total, refunds included;
 *  - a split only counts once everyone has confirmed the version that's there now;
 *  - a confirmation link shows on GET and acts on POST, is stored only as a hash, expires, and
 *    stops working when it's replaced or the sheet changes under it;
 *  - one label never reaches another's sheets, statements or collaborators, and an artist login
 *    reaches none of them;
 *  - a statement already worked out doesn't change when a sheet does, until the label asks, and
 *    never loses figures because a sheet is mid-edit or a release was deleted.
 *
 * Needs the app running (npx next start -p 3000) against the LOCAL database. Never Neon.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { signToken } from "../src/lib/crypto";
import { aggregate, aggregateText, allocate, bpsToPercent, detectDelimiter, guessDecimal, guessMapping, microsToDecimal, money, normIsrc, normUpc, parseAmount, parseDelimited, parseSheet, partyState, percentToBps, sheetConfirmed } from "../src/lib/royalties";
import { calculate, sendSheet, setSplitMailerForTests, tokenHash } from "../src/lib/royalties-server";

for (const name of ["NETLIFY_DATABASE_URL", "DATABASE_URL", "NETLIFY_DATABASE_URL_UNPOOLED"]) {
  if (/neon\.tech|neon\.build/i.test(process.env[name] ?? "")) { console.error(`Refusing to run: ${name} points at Neon.`); process.exit(1); }
}

const BASE = (process.env.TEST_BASE || "http://localhost:3000").replace(/\/$/, "");
const RUN = randomBytes(3).toString("hex");
let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

const session = (u: { id: string; organizationId: string; role: string }) => signToken({ sub: u.id, org: u.organizationId, role: u.role, jti: crypto.randomUUID() }, "1h", "session");
async function call(path: string, opts: { method?: string; body?: unknown; as?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? "POST", redirect: "manual", headers: { "Content-Type": "application/json", Origin: BASE, ...(opts.as ? { Cookie: `dfm_session=${opts.as}` } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
// React puts <!-- --> between adjacent text nodes and escapes quotes, so "20" and "%" are not one
// string in the HTML. Undo both before looking for text a person would read as one.
const readable = (html: string) => html.replace(/<!-- -->/g, "").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
const page = async (path: string, as?: string) => { const r = await fetch(`${BASE}${path}`, { headers: as ? { Cookie: `dfm_session=${as}` } : {}, redirect: "manual" }); return { status: r.status, text: readable(await r.text()), headers: r.headers }; };

function pureChecks() {
  console.log("\n1. Shares and money (pure)");
  check("percent to basis points", percentToBps("33.33") === 3333 && percentToBps("50") === 5000 && percentToBps("0.5") === 50 && percentToBps("100") === 10000);
  check("bad percentages are refused", percentToBps("100.01") === null && percentToBps("1.234") === null && percentToBps("-5") === null && percentToBps("abc") === null);
  check("basis points read back", bpsToPercent(3333) === "33.33" && bpsToPercent(3330) === "33.3" && bpsToPercent(3305) === "33.05" && bpsToPercent(5000) === "50");
  const p = (name: string, share: string, email: string | null = `${name.toLowerCase()}@example.com`, role = "artist") => ({ name, share, email, role });
  check("shares must total exactly 100%", "error" in parseSheet({ parties: [p("A", "50"), p("B", "49.99")] }));
  check("100% passes", "ok" in parseSheet({ parties: [p("A", "33.33"), p("B", "33.33"), p("C", "33.34")] }));
  check("an address twice is refused", "error" in parseSheet({ parties: [p("A", "50", "x@example.com"), p("B", "50", "X@example.com")] }));
  check("a collaborator needs an address", "error" in parseSheet({ parties: [p("A", "100", null)] }));
  check("the label's own share doesn't", "ok" in parseSheet({ parties: [p("A", "60"), p("Label", "40", null, "label")] }));
  check("a bad address is refused", "error" in parseSheet({ parties: [p("A", "100", "not-an-email")] }));
  check("a name that looks like a web address is refused", "error" in parseSheet({ parties: [p("Claim at evil.com", "100")] }) && "error" in parseSheet({ parties: [p("see https://x", "100")] }));
  check("artist names with dots pass", "ok" in parseSheet({ parties: [p("will.i.am", "50", "w@example.com"), p("Dr.Dre", "50", "d@example.com")] }));
  check("a full-width dot doesn't get a domain past", "error" in parseSheet({ parties: [p("visit evil\uFF0Ecom", "100", "v@example.com")] }));
  check("an ordinary name with a full stop is fine", "ok" in parseSheet({ parties: [p("J. Smith", "100", "js@example.com")] }));
  const party = (c: number | null, s: number | null = null, d: number | null = null) => ({ role: "artist", email: "a@x.co", sentVersion: s, confirmedVersion: c, disputedVersion: d });
  check("confirming an older version doesn't count", partyState(party(1, 2), 2) === "waiting" && !sheetConfirmed([party(1), party(2)], 2));
  check("all confirmed on the current version counts", sheetConfirmed([party(2), party(2)], 2));
  check("an empty sheet is never confirmed", !sheetConfirmed([], 1));

  console.log("\n2. Reading a statement (pure)");
  check("tab-separated is detected", detectDelimiter("Title\tISRC\tEarnings\nA\tB\tC") === "\t");
  check("semicolons are detected", detectDelimiter("Title;ISRC;Earnings\n") === ";");
  check("a quoted comma stays in its field", JSON.stringify(parseDelimited('Title,Amount\n"Hello, World",1.5\n', ",")[1]) === JSON.stringify(["Hello, World", "1.5"]));
  const dk = ["Reporting Date", "Sale Month", "Store", "Artist", "Title", "ISRC", "UPC", "Quantity", "Team Percentage", "Song/Album", "Country of Sale", "Songwriter Royalties Withheld", "Earnings (USD)"];
  const gm = guessMapping(dk, [["", "", "", "", "", "", "", "", "", "", "", "", "0.0034"]]);
  check("a DistroKid-style header maps itself", gm.isrc === 5 && gm.upc === 6 && gm.amount === 12 && gm.decimal === ".", JSON.stringify(gm));
  const amt = (s: string, d: "." | "," = ".") => { const n = parseAmount(s, d); return n === null ? null : n.toString(); };
  check("thousands and decimals", amt("1,234.56") === "1234560000000000");
  check("a currency symbol and tiny fractions", amt("$0.0000123456789") === "12345678");
  check("accounting brackets are negative", amt("(1.50)") === "-1500000000000");
  check("a leading minus is negative", amt("-0.5") === "-500000000000");
  check("a decimal comma", amt("1.234,56", ",") === "1234560000000000");
  check("exponent notation, as distributors write fractions of a cent", amt("1.2E-05") === "12000000" && amt("1.5E+3") === "1500000000000000" && amt("-1.2e-3") === "-1200000000");
  check("a typographic minus is still a refund", amt("−0.05") === "-50000000000" && amt("–0.05") === "-50000000000");
  check("a trailing minus is a refund", amt("0.05-") === "-50000000000");
  check("non-breaking-space thousands", amt("1 234,56", ",") === "1234560000000000");
  check("0,125 is a decimal comma, 1,250 is left for the label to say", guessDecimal(["0,125", "0,250"]) === "," && guessDecimal(["1,250", "2,500"]) === ".");
  check("an amount too big to be a royalty line is refused", amt("1234567890123456") === null);
  check("a currency code after the number", amt("1.00 EUR") === "1000000000000" && amt("12.50SEK") === "12500000000000");
  check("a bracket after a currency symbol is still negative", amt("$(1.00)") === "-1000000000000" && amt("(USD 2.00)") === "-2000000000000");
  check("an exponent can't make a giant number", amt("1E999") === null && amt("999999999999999999999999999999E0") === null);
  check("rubbish is not a number", amt("abc") === null && amt("1.2.3") === null && amt("") === null && amt("1-2") === null);
  check("a 12-digit UPC and its 13-digit EAN are the same", normUpc("0602445123456") === normUpc("602445123456"));
  check("an ISRC loses its hyphens and case", normIsrc("au-abc-26-00001") === "AUABC2600001" && normIsrc("too short") === "");
  const many = Array.from({ length: 100_000 }, () => ["AUABC2600001", "", "0.0000001"]);
  const agg = aggregate(many, { upc: 1, isrc: 0, amount: 2, currency: -1, decimal: "." });
  check("100,000 lines of 0.0000001 sum to exactly 0.01", agg.pairs.length === 1 && agg.pairs[0].micros === "10000" && agg.pairs[0].rows === 100_000, JSON.stringify(agg.pairs[0]));
  const mixed = aggregate([["AUABC2600001", "x", "1"], ["", "", "2"], ["AUABC2600002", "y", "n/a"]], { upc: -1, isrc: 0, amount: 2, currency: 1, decimal: "." });
  check("rows with no id or no amount are skipped, not guessed", mixed.skipped === 2 && mixed.pairs.length === 1 && mixed.rowsTotal === 3);
  check("currencies in the file are reported", mixed.currencies.join() === "X");
  const tsv = "ISRC\tUPC\tEarnings (USD)\n" + Array.from({ length: 5000 }, (_, i) => `AUABC260000${i % 3}\t\t"0.00${i % 7}"`).join("\r\n") + "\n";
  const m = guessMapping(["ISRC", "UPC", "Earnings (USD)"], []);
  const viaText = aggregateText(tsv, "\t", m), viaRows = aggregate(parseDelimited(tsv, "\t").slice(1), m);
  check("reading a file row by row gives the same totals as holding it all", JSON.stringify(viaText) === JSON.stringify(viaRows) && viaText.rowsTotal === 5000);

  console.log("\n3. Splitting (pure)");
  const thirds = allocate(100n, [{ key: "a", bps: 3333 }, { key: "b", bps: 3333 }, { key: "c", bps: 3334 }]);
  check("three ways, the parts add up exactly", [...thirds.values()].reduce((n, v) => n + v, 0n) === 100n);
  const odd = allocate(1n, [{ key: "a", bps: 5000 }, { key: "b", bps: 5000 }]);
  check("one millionth between two goes to the first, not both", odd.get("a") === 1n && odd.get("b") === 0n);
  const refund = allocate(-1_000_001n, [{ key: "a", bps: 7000 }, { key: "b", bps: 3000 }]);
  check("a refund splits the same way, mirrored, and adds up", refund.get("a")! + refund.get("b")! === -1_000_001n && refund.get("a")! < 0n);
  let exact = true;
  for (let i = 0; i < 2000; i++) {
    const total = BigInt(Math.floor(Math.random() * 1e12) - 5e11);
    const a = Math.floor(Math.random() * 10_000), b = Math.floor(Math.random() * (10_000 - a));
    const parts = allocate(total, [{ key: "x", bps: a }, { key: "y", bps: b }, { key: "z", bps: 10_000 - a - b }]);
    if ([...parts.values()].reduce((n, v) => n + v, 0n) !== total) { exact = false; break; }
  }
  check("2,000 random splits all add up to the cent and below", exact);
  check("money shows two places", money(12_345_678n, "AUD").includes("12.35"));
  check("exact decimals for the CSV", microsToDecimal(-1_234_567n) === "-1.234567" && microsToDecimal("5") === "0.000005");
}

async function main() {
  pureChecks();
  let mails: { to: string; subject: string; text: string }[] = [];
  setSplitMailerForTests(async (mm) => { mails.push({ to: mm.to, subject: mm.subject, text: mm.text }); });
  const linkIn = (text: string) => text.match(/\/split\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
  const mkOrg = (name: string, plan: string, kind = "label") => prisma.organization.create({ data: { name: `${name} Records ${RUN}`, slug: `ry-${name}-${RUN}`, plan, kind, betaFeatures: ["royalties"] } });
  const orgs: { id: string }[] = [];
  const pro = await mkOrg("pro", "label"); orgs.push(pro);
  const free = await mkOrg("free", "free"); orgs.push(free);
  const other = await mkOrg("other", "label"); orgs.push(other);
  try {
    const mkUser = (org: { id: string }, role: string, tag: string) => prisma.user.create({ data: { email: `ry-${tag}-${RUN}@example.com`, passwordHash: "x", role, organizationId: org.id, emailVerifiedAt: new Date() } });
    const owner = await mkUser(pro, "owner", "owner"), artistUser = await mkUser(pro, "artist", "artist"), freeOwner = await mkUser(free, "owner", "free"), otherOwner = await mkUser(other, "owner", "other");
    const [sOwner, sArtist, sFree, sOther] = await Promise.all([owner, artistUser, freeOwner, otherOwner].map(session));
    const mkRel = (org: { id: string }, slug: string, extra: Record<string, unknown> = {}) => prisma.release.create({ data: { organizationId: org.id, slug: `ry-${slug}-${RUN}`, title: `Track ${slug} ${RUN}`, artistName: "Planner", coverUrl: "https://example.com/c.jpg", releaseDate: new Date(), ...extra } });
    const relA = await mkRel(pro, "a", { upc: "0602445000001", artistId: artistUser.id });
    const relB = await mkRel(pro, "b", { isrc: "AU-RRR-26-00002" });
    const relC = await mkRel(pro, "c", { upc: "602445000003" });
    const gate = await mkRel(pro, "gate", { kind: "download", downloadUrl: "https://example.com/f.zip", upc: "602445000009" });
    const freeRel = await mkRel(free, "free");
    const otherRel = await mkRel(other, "theirs", { upc: "602445000004" });
    const collab = (n: string) => `ry-${n}-${RUN}@collab.example`;
    const sheetBody = { parties: [{ name: "Planner", email: collab("artist"), role: "artist", share: "50" }, { name: "Beats", email: collab("producer"), role: "producer", share: "20" }, { name: "Label", email: null, role: "label", share: "30" }] };
    const proOrg = (await prisma.organization.findUnique({ where: { id: pro.id } }))!;
    const relFull = (r: { id: string; organizationId: string; title: string; artistName: string }, org: { name: string }) => ({ ...r, organization: { name: org.name } });

    console.log("\n4. Who can make a split sheet");
    const url = (r: { id: string }) => `/api/admin/releases/${r.id}/splits`;
    check("logged out can't", (await call(url(relA), { method: "PUT", body: sheetBody })).status === 401);
    check("an artist login can't", (await call(url(relA), { method: "PUT", body: sheetBody, as: sArtist })).status === 401);
    check("another label gets a 404", (await call(url(relA), { method: "PUT", body: sheetBody, as: sOther })).status === 404);
    const fr = await call(url(freeRel), { method: "PUT", body: sheetBody, as: sFree });
    check("a free label can't start one, and nothing is written", fr.status === 402 && (await prisma.splitSheet.count({ where: { organizationId: free.id } })) === 0, String(fr.status));
    check("a download gate can't have one", (await call(url(gate), { method: "PUT", body: sheetBody, as: sOwner })).status === 400);
    check("shares that don't make 100% are refused", (await call(url(relA), { method: "PUT", body: { parties: [{ name: "A", email: collab("x"), share: "90" }] }, as: sOwner })).status === 400 && !(await prisma.splitSheet.findUnique({ where: { releaseId: relA.id } })));
    const saved = await call(url(relA), { method: "PUT", body: sheetBody, as: sOwner });
    check("the label saves a sheet at version 1", saved.status === 200 && saved.json.version === 1, saved.text.slice(0, 100));
    const sheet = (await prisma.splitSheet.findUnique({ where: { releaseId: relA.id }, include: { parties: { orderBy: { position: "asc" } } } }))!;
    check("a party from another sheet can't be smuggled in", (await call(url(relA), { method: "PUT", body: { parties: [{ id: "c" + RUN.repeat(4), name: "X", email: collab("y"), share: "100" }] }, as: sOwner })).status === 400);

    console.log("\n5. Confirming");
    // Mail goes out from the server process, which this script can't capture, so the route is checked
    // for who may call it and the send itself runs here, through the same function the route calls.
    check("another label can't send it", (await call(`${url(relA)}/send`, { as: sOther })).status === 404);
    check("an artist login can't send it", (await call(`${url(relA)}/send`, { as: sArtist })).status === 401);
    mails = [];
    const sent = await sendSheet(relFull(relA, proOrg));
    check("sending emails the two collaborators", "sent" in sent && sent.sent === 2 && mails.length === 2, JSON.stringify(sent));
    check("the subject is neutral, the label's name is in the body", mails.every((mm) => mm.subject === "Please confirm your share on a split sheet") && mails[0]?.text.includes(`pro Records ${RUN}`));
    const labelParty = await prisma.splitParty.findFirst({ where: { sheetId: sheet.id, role: "label" } });
    check("the label's own share is confirmed by sending", labelParty?.confirmedVersion === 1);
    const tokenOf = (to: string) => linkIn(mails.find((mm) => mm.to === to)?.text ?? "");
    const tArtist = tokenOf(collab("artist")), tProducer = tokenOf(collab("producer"));
    const stored = await prisma.splitParty.findFirst({ where: { sheetId: sheet.id, email: collab("artist") } });
    check("the link is stored only as a hash", stored?.tokenHash === tokenHash(tArtist) && !JSON.stringify(stored).includes(tArtist));
    const view = await page(`/split/${tArtist}`);
    check("opening the link shows the sheet", view.status === 200 && view.text.includes(`Track a ${RUN}`) && view.text.includes("Beats") && view.text.includes("20%"));
    check("and nobody's email address", !view.text.includes(collab("producer")) && !view.text.includes(collab("artist")));
    check("opening it changes nothing", (await prisma.splitParty.findUnique({ where: { id: stored!.id } }))?.confirmedVersion === null);
    check("the page isn't indexed and sets no visitor cookie", /noindex/.test(view.text) && !(view.headers.get("set-cookie") ?? "").includes("dfm_anon"));
    check("a made-up link shows nothing", !(await page(`/split/${"x".repeat(32)}`)).text.includes(`Track a ${RUN}`));
    check("answering for an old version is refused", (await call(`/api/split/${tArtist}`, { body: { action: "confirm", version: 0 } })).status === 409);
    check("the artist confirms", (await call(`/api/split/${tArtist}`, { body: { action: "confirm", version: 1 } })).status === 200);
    check("the producer says something's wrong", (await call(`/api/split/${tProducer}`, { body: { action: "dispute", version: 1, note: "Should be 25%" } })).status === 200);
    const tab = await page(`/admin/releases/${relA.id}?tab=splits`, sOwner);
    check("the label sees who confirmed and what's wrong", tab.text.includes("Confirmed") && tab.text.includes("Should be 25%"), `${tab.status}`);
    check("not confirmed while anyone disputes", !sheetConfirmed((await prisma.splitParty.findMany({ where: { sheetId: sheet.id } })), 1));

    // Fix the producer's share: a new version, and everyone confirms again.
    const v2 = await call(url(relA), { method: "PUT", body: { parties: sheet.parties.map((pt) => ({ id: pt.id, name: pt.name, email: pt.email, role: pt.role, share: pt.role === "producer" ? "25" : pt.role === "artist" ? "45" : "30" })) }, as: sOwner });
    check("changing a share makes version 2", v2.json.version === 2);
    check("the artist's confirmation of version 1 no longer counts", partyState((await prisma.splitParty.findUnique({ where: { id: stored!.id } }))!, 2) !== "confirmed");
    check("the version-1 page can't confirm version 2 blind", (await call(`/api/split/${tArtist}`, { body: { action: "confirm", version: 1 } })).status === 409);
    mails = [];
    await sendSheet(relFull(relA, proOrg));
    check("re-sending replaces the old link", (await call(`/api/split/${tArtist}`, { body: { action: "confirm", version: 2 } })).status === 404 && !(await page(`/split/${tArtist}`)).text.includes(`Track a ${RUN}`));
    for (const mm of mails) await call(`/api/split/${linkIn(mm.text)}`, { body: { action: "confirm", version: 2 } });
    check("everyone has confirmed version 2", sheetConfirmed(await prisma.splitParty.findMany({ where: { sheetId: sheet.id } }), 2));
    const expiredParty = await prisma.splitParty.findFirst({ where: { sheetId: sheet.id, email: collab("producer") } });
    const tExp = randomBytes(24).toString("base64url");
    await prisma.splitParty.update({ where: { id: expiredParty!.id }, data: { tokenHash: tokenHash(tExp), tokenExpiresAt: new Date(Date.now() - 1000) } });
    check("an expired link does nothing", (await call(`/api/split/${tExp}`, { body: { action: "dispute", version: 2 } })).status === 404 && (await prisma.splitParty.findUnique({ where: { id: expiredParty!.id } }))?.confirmedVersion === 2);

    // Address cap: three sends to one address from one account in a day go; the fourth doesn't.
    const capRel = await mkRel(pro, "cap");
    await call(url(capRel), { method: "PUT", body: { parties: [{ name: "Cap", email: collab("cap"), share: "100" }] }, as: sOwner });
    let capped = 0;
    for (let i = 0; i < 4; i++) { const r = await sendSheet(relFull(capRel, proOrg)); capped += "capped" in r ? (r.capped ?? 0) : 0; }
    check("one account emails one address at most 3 times a day", capped === 1, String(capped));
    // Another account can still reach that address: one label can't use up a collaborator's allowance.
    const otherCap = await mkRel(other, "cap2");
    await call(url(otherCap), { method: "PUT", body: { parties: [{ name: "Cap", email: collab("cap"), share: "100" }] }, as: sOther });
    const oc = await sendSheet(relFull(otherCap, { name: `other Records ${RUN}` }));
    check("another label can still email that address", "sent" in oc && oc.sent === 1, JSON.stringify(oc));

    // Sheet on relB (ISRC match), unconfirmed; relC none.
    await call(url(relB), { method: "PUT", body: { parties: [{ name: "Solo", email: collab("solo"), share: "100" }] }, as: sOwner });

    console.log("\n6. Statements");
    const imp = (pairs: unknown, extra: Record<string, unknown> = {}) => ({ title: `Q3 ${RUN}`, currency: "AUD", periodStart: "2026-07-01", periodEnd: "2026-09-30", rowsTotal: 100, pairs, ...extra });
    const pairs = [
      { upc: "602445000001", isrc: "", micros: "10000001", rows: 40 },
      { upc: "", isrc: "AURRR2600002", micros: "5000000", rows: 20 },
      { upc: "602445000003", isrc: "", micros: "-250000", rows: 2 },
      { upc: "602445000004", isrc: "", micros: "7000000", rows: 5 },
      { upc: "602445000009", isrc: "", micros: "1000000", rows: 3 },
    ];
    check("logged out can't import", (await call("/api/admin/royalties", { body: imp(pairs) })).status === 401);
    check("an artist login can't", (await call("/api/admin/royalties", { body: imp(pairs), as: sArtist })).status === 401);
    check("a free label can't, and nothing is written", (await call("/api/admin/royalties", { body: imp(pairs), as: sFree })).status === 402 && (await prisma.statementImport.count({ where: { organizationId: free.id } })) === 0);
    check("a non-integer amount is refused", (await call("/api/admin/royalties", { body: imp([{ upc: "1", isrc: "", micros: "1.5", rows: 1 }]), as: sOwner })).status === 400);
    check("more rows than the file had is refused", (await call("/api/admin/royalties", { body: imp(pairs, { rowsTotal: 10 }), as: sOwner })).status === 400);
    check("a made-up currency is refused", (await call("/api/admin/royalties", { body: imp(pairs, { currency: "XYZW" }), as: sOwner })).status === 400);
    const made = await call("/api/admin/royalties", { body: imp(pairs), as: sOwner });
    const impId = made.json.id as string;
    check("the label imports a statement", made.status === 200 && !!impId, made.text.slice(0, 120));
    const lines = await prisma.statementLine.findMany({ where: { importId: impId } });
    check("UPCs match with or without the leading zero, ISRCs without hyphens", lines.some((l) => l.releaseId === relA.id && l.amountMicros === 10_000_001n) && lines.some((l) => l.releaseId === relB.id));
    check("a refund line is kept negative", lines.some((l) => l.releaseId === relC.id && l.amountMicros === -250_000n));
    check("each line keeps its release's title", lines.every((l) => l.releaseTitle.includes(RUN)));
    check("another label's UPC matches nothing here", !lines.some((l) => l.releaseId === otherRel.id));
    check("a download gate's UPC matches nothing", !lines.some((l) => l.releaseId === gate.id));
    const st = (await prisma.statementImport.findUnique({ where: { id: impId } }))!;
    check("unmatched totals are kept so the label can see them", st.unmatchedMicros === 8_000_000n && JSON.stringify(st.unmatched).includes("602445000004"));
    const allocs = await prisma.statementAllocation.findMany({ where: { importId: impId } });
    check("only the confirmed sheet is split", allocs.length === 3 && allocs.every((a) => a.releaseId === relA.id));
    check("its parts add up to the release's total exactly", allocs.reduce((n, a) => n + a.amountMicros, 0n) === 10_000_001n);
    check("the shares are version 2's", allocs.find((a) => a.partyRole === "Producer")?.shareBps === 2500 && allocs.every((a) => a.sheetVersion === 2));
    check("no party key carries an email address", allocs.every((a) => !a.partyKey.includes("@")));

    const detail = await page(`/admin/royalties/${impId}`, sOwner);
    check("the statement page shows who is owed what", detail.status === 200 && detail.text.includes("Planner") && detail.text.includes("Beats"));
    check("and says why a release wasn't split", detail.text.includes("Not split") && detail.text.includes("No split sheet"));
    const prod = allocs.find((a) => a.partyRole === "Producer")!;
    const stmt = await page(`/admin/royalties/${impId}/party/${prod.partyKey}`, sOwner);
    check("a collaborator's statement prints", stmt.status === 200 && stmt.text.includes("Beats") && stmt.text.includes("before any recoupment"));
    const csv = await fetch(`${BASE}/api/admin/royalties/${impId}/export?party=${prod.partyKey}`, { headers: { Cookie: `dfm_session=${sOwner}` } });
    const csvText = await csv.text();
    check("their CSV holds only their lines, uncached", csv.status === 200 && (csv.headers.get("cache-control") ?? "").includes("no-store") && csvText.includes("Beats") && !/^[^,\n]*,Planner,/m.test(csvText));
    check("amounts in the CSV are exact", csvText.includes(microsToDecimal(prod.amountMicros)));
    check("a made-up party key in the export is a 404, not a 500", (await call(`/api/admin/royalties/${impId}/export?party=%22%0Aevil`, { method: "GET", as: sOwner })).status === 404);

    // Editing the sheet afterwards leaves the statement alone; working it out again mid-edit keeps the last figures.
    const relAParties = (await prisma.splitParty.findMany({ where: { sheet: { releaseId: relA.id } }, orderBy: { position: "asc" } }));
    await call(url(relA), { method: "PUT", body: { parties: relAParties.map((pt) => ({ id: pt.id, name: pt.name, email: pt.email, role: pt.role, share: pt.role === "producer" ? "30" : pt.role === "artist" ? "40" : "30" })) }, as: sOwner });
    check("editing a sheet doesn't rewrite a statement already made", (await prisma.statementAllocation.count({ where: { importId: impId } })) === 3);
    check("working it out again while the sheet is unconfirmed keeps the last figures", (await call(`/api/admin/royalties/${impId}/calculate`, { as: sOwner })).status === 200 && (await prisma.statementAllocation.count({ where: { importId: impId } })) === 3);
    check("and the page says they came from an earlier version", (await page(`/admin/royalties/${impId}`, sOwner)).text.includes("Split by version 2 of the sheet, now version 3"));

    console.log("\n6b. What the review found");
    // Saving returns ids, so saving again updates people instead of replacing them (and their links).
    const relD = await mkRel(pro, "d", { upc: "602445000005" });
    const first = await call(url(relD), { method: "PUT", body: { parties: [{ name: "Dee", email: collab("dee"), share: "60" }, { name: "Label", email: null, role: "label", share: "40" }] }, as: sOwner });
    const firstParties = (first.json.parties as { id: string; name: string; email: string; role: string; share: string }[] | undefined) ?? [];
    check("saving returns the people with their ids", firstParties.length === 2 && firstParties.every((x) => !!x.id));
    mails = [];
    await sendSheet(relFull(relD, proOrg));
    const tDee = linkIn(mails[0]?.text ?? "");
    const resave = await call(url(relD), { method: "PUT", body: { parties: firstParties.map((x) => ({ ...x, email: x.email || null })) }, as: sOwner });
    check("saving the same people again keeps the version and the link", resave.json.version === 1 && (await page(`/split/${tDee}`)).text.includes(`Track d ${RUN}`));
    await prisma.organization.update({ where: { id: pro.id }, data: { name: "Visit evil.com" } });
    const urlSend = await sendSheet({ ...relD, organization: { name: "Visit evil.com" } });
    check("an account name that looks like a web address isn't emailed", "error" in urlSend);
    // The 30-day limit can't be reset by deleting the people it was spent on.
    const logged = await prisma.splitSendLog.count({ where: { organizationId: pro.id } });
    await prisma.splitParty.deleteMany({ where: { sheet: { releaseId: capRel.id } } });
    check("deleting people doesn't give back the month's sends", logged > 0 && (await prisma.splitSendLog.count({ where: { organizationId: pro.id } })) === logged);
    // At 500 in 30 days, the next send waits.
    await prisma.splitSendLog.createMany({ data: Array.from({ length: Math.max(0, 500 - logged) }, () => ({ organizationId: pro.id })) });
    const monthRel = await mkRel(pro, "month");
    await call(url(monthRel), { method: "PUT", body: { parties: [{ name: "Month", email: collab("month"), share: "100" }] }, as: sOwner });
    const atCap = await sendSheet(relFull(monthRel, proOrg));
    check("at 500 sends in 30 days the next is held back", "capped" in atCap && atCap.capped === 1 && atCap.sent === 0, JSON.stringify(atCap));
    await prisma.splitSendLog.deleteMany({ where: { organizationId: pro.id } });
    await prisma.organization.update({ where: { id: pro.id }, data: { name: proOrg.name } });
    await call(`/api/split/${tDee}`, { body: { action: "confirm", version: 1 } });
    await sendSheet(relFull(relD, proOrg));
    // Dee is also on relA, under another name: one collaborator, one line on the statement.
    await call(url(relA), { method: "PUT", body: { parties: [{ name: "Planner", email: collab("artist"), role: "artist", share: "50" }, { name: "Dee (as producer)", email: collab("dee"), role: "producer", share: "50" }] }, as: sOwner });
    mails = [];
    await sendSheet(relFull(relA, proOrg));
    const vA = (await prisma.splitSheet.findUnique({ where: { releaseId: relA.id } }))!.version;
    for (const mm of mails) await call(`/api/split/${linkIn(mm.text)}`, { body: { action: "confirm", version: vA } });
    const two = await call("/api/admin/royalties", { body: imp([{ upc: "602445000001", isrc: "", micros: "1000001", rows: 1 }, { upc: "602445000005", isrc: "", micros: "3", rows: 1 }], { title: `Two ${RUN}`, rowsTotal: 2 }), as: sOwner });
    const twoId = two.json.id as string;
    const keys = await prisma.statementAllocation.groupBy({ by: ["partyKey"], where: { importId: twoId } });
    check("one address on two releases is one collaborator", two.status === 200 && keys.length === 3, `${two.status} ${keys.length}`);
    const twoPage = await page(`/admin/royalties/${twoId}`, sOwner);
    check("and one line on the statement page", (twoPage.text.match(/>Dee[^<]*</g) ?? []).length === 1, String((twoPage.text.match(/>Dee[^<]*</g) ?? []).length));
    const sig = (rows: { lineId: string; partyKey: string; amountMicros: bigint }[]) => rows.map((a) => `${a.lineId}|${a.partyKey}|${a.amountMicros}`).sort().join();
    const before = sig(await prisma.statementAllocation.findMany({ where: { importId: twoId } }));
    await Promise.all([calculate(twoId, pro.id), calculate(twoId, pro.id), calculate(twoId, pro.id)]);
    const afterRows = await prisma.statementAllocation.findMany({ where: { importId: twoId } });
    check("three recalculations at once don't double anything", afterRows.length === 4 && afterRows.reduce((n, a) => n + a.amountMicros, 0n) === 1_000_004n, `${afterRows.length}`);
    check("working it out again gives the same millionths", sig(afterRows) === before);
    // Deleting a release keeps the statement's figures, and working it out again doesn't drop them.
    await prisma.release.delete({ where: { id: relD.id } });
    await calculate(twoId, pro.id);
    const kept = await prisma.statementLine.findMany({ where: { importId: twoId } });
    check("a deleted release's line stays, by title", kept.length === 2 && kept.some((l) => l.releaseId === null && l.releaseTitle.includes(`Track d ${RUN}`)));
    check("and its split stays", (await prisma.statementAllocation.count({ where: { importId: twoId } })) === 4);
    check("the export keeps the title of a deleted release", (await (await fetch(`${BASE}/api/admin/royalties/${twoId}/export`, { headers: { Cookie: `dfm_session=${sOwner}` } })).text()).includes(`Track d ${RUN}`));

    console.log("\n7. Other labels and artists");
    check("another label can't open it", (await page(`/admin/royalties/${impId}`, sOther)).status === 404);
    check("another label can't export it", (await call(`/api/admin/royalties/${impId}/export`, { method: "GET", as: sOther })).status === 404);
    check("another label can't work it out again", (await call(`/api/admin/royalties/${impId}/calculate`, { as: sOther })).status === 404);
    check("another label can't delete it", (await call(`/api/admin/royalties/${impId}`, { method: "DELETE", as: sOther })).status === 404 && !!(await prisma.statementImport.findUnique({ where: { id: impId } })));
    check("another label can't delete a sheet", (await call(url(relA), { method: "DELETE", as: sOther })).status === 404 && !!(await prisma.splitSheet.findUnique({ where: { releaseId: relA.id } })));
    check("another label's list shows none of it", !(await page("/admin/royalties", sOther)).text.includes(`Q3 ${RUN}`));
    check("an artist login is sent away from royalties", (await page("/admin/royalties", sArtist)).status >= 300);
    check("the artist's dashboard carries no collaborator addresses", !(await page("/dashboard", sArtist)).text.includes("@collab.example"));
    const close = await page("/admin/settings/account/close", sOwner);
    check("the close page says statements go", close.text.includes("royalty statement"));
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "free" } });
    check("after a downgrade, a sheet that exists can still be edited", (await call(url(relB), { method: "PUT", body: { parties: [{ name: "Solo", email: collab("solo"), share: "100" }] }, as: sOwner })).status === 200);
    const addNew = await call(url(relB), { method: "PUT", body: { parties: [{ name: "Solo", email: collab("solo"), share: "50" }, { name: "New", email: collab("new"), share: "50" }] }, as: sOwner });
    check("after a downgrade, a new address can't be added to it", addNew.status === 402 && !(await prisma.splitParty.findFirst({ where: { email: collab("new") } })));
    check("after a downgrade, a new sheet is refused", (await call(url(relC), { method: "PUT", body: sheetBody, as: sOwner })).status === 402);
    check("after a downgrade, a new import is refused", (await call("/api/admin/royalties", { body: imp(pairs), as: sOwner })).status === 402);
    check("after a downgrade, a statement still exports", (await fetch(`${BASE}/api/admin/royalties/${impId}/export`, { headers: { Cookie: `dfm_session=${sOwner}` } })).status === 200);
    await prisma.organization.update({ where: { id: pro.id }, data: { plan: "label" } });
    check("the label deletes the statement", (await call(`/api/admin/royalties/${impId}`, { method: "DELETE", as: sOwner })).status === 200 && (await prisma.statementLine.count({ where: { importId: impId } })) === 0);
  } finally {
    const ids = orgs.map((o) => o.id);
    await prisma.statementImport.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.release.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    await prisma.authThrottle.deleteMany({ where: { key: { startsWith: "split-" } } }).catch(() => {});
    await prisma.splitSendLog.deleteMany({ where: { organizationId: { in: ids } } });
    setSplitMailerForTests(null);
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
