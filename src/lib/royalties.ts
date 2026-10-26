/**
 * Royalties and splits: the pure half. No database import — the statement importer runs in the
 * label's browser, parses the distributor's file there, and sends droplr only totals per UPC/ISRC.
 *
 * Money is BigInt, never a float. Statement lines are summed at 1e-12 of a unit (royalty lines are
 * often fractions of a cent with ten decimal places) and rounded once, to millionths, per release.
 * (Each UPC/ISRC total is rounded once; a release's total is the sum of those.)
 * Splitting uses largest-remainder, so the parties' amounts always add up to the release's amount
 * exactly. droplr tracks who is owed what; it never holds, moves or pays any of it.
 */

export const ROLES = ["artist", "featured", "producer", "remixer", "writer", "label", "other"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { artist: "Artist", featured: "Featured artist", producer: "Producer", remixer: "Remixer", writer: "Writer", label: "Label", other: "Other" };

/**
 * Something an email client would turn into a link: a scheme, "www.", or a dot before a common
 * top-level domain. Deliberately narrow so names like Dr.Dre, Mr.Oizo or J. Smith pass. It slows
 * abuse down; it can't stop someone determined to write "evil [dot] com".
 */
const TLDS = "com|net|org|io|co|xyz|app|dev|info|biz|me|ly|link|site|online|top|click|shop|store|live|fm|gg|tv|uk|au|nz|de|fr|ru|cn|us|ca|in|br|es|it|nl|eu|ai|so|to|cc|ws|pw|tk|ml|ga|cf|gq|win|vip|club|icu|cyou|lol|zip|mov";
const URLISH = new RegExp(`https?:|www\\.|[a-z0-9-]\\.(?:${TLDS})(?![a-z0-9-])`, "i");
export const looksLikeUrl = (s: string) => URLISH.test(s.normalize("NFKC").replace(/[。．｡]/g, "."));

export const SPLIT_LIMITS = { parties: 20, name: 120, dispute: 500, title: 120, pairs: 20_000, rows: 1_000_000 };
export const TOTAL_BPS = 10_000;
/** A confirmation link lasts this long; sending again makes a new one. */
export const CONFIRM_TTL_MS = 30 * 86_400_000;

const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** "33.33" → 3333 basis points. Up to two decimal places, 0–100. Anything else is null. */
export function percentToBps(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return bps <= TOTAL_BPS ? bps : null;
}
export const bpsToPercent = (bps: number) => `${Math.floor(bps / 100)}${bps % 100 ? `.${String(bps % 100).padStart(2, "0").replace(/0$/, "")}` : ""}`;

export type PartyInput = { id?: string; name: string; email: string | null; role: Role; shareBps: number };

/**
 * Validate a whole sheet from a request body: { parties: [{ id?, name, email?, role, share }] },
 * share as a percentage string. Shares must total exactly 100%. Emails, when given, must be real
 * and not repeated. Every party but the label needs one, because confirming is by email.
 */
export function parseSheet(body: unknown): { ok: PartyInput[] } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { parties?: unknown };
  if (!Array.isArray(b.parties) || !b.parties.length) return { error: "Add at least one person." };
  if (b.parties.length > SPLIT_LIMITS.parties) return { error: `A split sheet holds up to ${SPLIT_LIMITS.parties} people.` };
  const out: PartyInput[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of b.parties.entries()) {
    const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const n = i + 1;
    const name = typeof p.name === "string" ? p.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > SPLIT_LIMITS.name) return { error: `Person ${n} needs a name under ${SPLIT_LIMITS.name} characters.` };
    // The name goes into an email to them: one an email client turns into a link is a phishing line.
    if (looksLikeUrl(name)) return { error: `${name} looks like a web address. Use the person's name.` };
    const role = p.role ?? "artist";
    if (!(ROLES as readonly unknown[]).includes(role)) return { error: `Pick a role for ${name}.` };
    const share = percentToBps(p.share);
    if (share === null) return { error: `${name}'s share has to be a percentage, like 50 or 33.33.` };
    const emailRaw = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
    if (emailRaw && (emailRaw.length > 254 || !EMAIL.test(emailRaw))) return { error: `${name}'s email doesn't look right.` };
    if (!emailRaw && role !== "label") return { error: `${name} needs an email address to confirm their share. Only the label's own share can go without one.` };
    if (emailRaw && seen.has(emailRaw)) return { error: `${emailRaw} is on the sheet twice.` };
    if (emailRaw) seen.add(emailRaw);
    if (p.id !== undefined && (typeof p.id !== "string" || p.id.length > 40)) return { error: "Bad request" };
    out.push({ ...(typeof p.id === "string" ? { id: p.id } : {}), name, email: emailRaw || null, role: role as Role, shareBps: share });
  }
  const total = out.reduce((n, p) => n + p.shareBps, 0);
  if (total !== TOTAL_BPS) return { error: `The shares add up to ${bpsToPercent(total)}%. They have to come to exactly 100%.` };
  return { ok: out };
}

export type PartyState = "confirmed" | "disputed" | "waiting" | "not-sent";
/** Where one party stands on the sheet as it is now. A confirmation of an older version is not a confirmation. */
export function partyState(p: { role: string; email: string | null; sentVersion: number | null; confirmedVersion: number | null; disputedVersion: number | null }, version: number): PartyState {
  if (p.confirmedVersion === version) return "confirmed";
  if (p.disputedVersion === version) return "disputed";
  if (p.sentVersion === version) return "waiting";
  return "not-sent";
}
export const sheetConfirmed = (parties: Parameters<typeof partyState>[0][], version: number) => parties.length > 0 && parties.every((p) => partyState(p, version) === "confirmed");

// ---- Statements -----------------------------------------------------------------------------

const SCALE = 1_000_000_000_000n; // 1e-12 of a unit while summing
const TO_MICROS = 1_000_000n; // SCALE / 1e6

/** Tab, semicolon or comma, whichever the header line uses most. DistroKid exports are tab-separated. */
export function detectDelimiter(text: string): "\t" | ";" | "," {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => first.split(c).length - 1;
  const tabs = count("\t"), semis = count(";"), commas = count(",");
  if (tabs >= semis && tabs >= commas && tabs > 0) return "\t";
  return semis > commas ? ";" : ",";
}

/**
 * A quoting-aware split on one delimiter, a row at a time. Real exports have the delimiter inside
 * quoted titles. `onRow` returning false stops early. Rows are never all held at once, so a
 * statement of a million lines costs one row of memory, not a million.
 */
export function eachRow(text: string, delim: string, onRow: (row: string[]) => boolean | void) {
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const emit = () => { row.push(field); field = ""; const r = row; row = []; return r.some((f) => f.trim() !== "") ? onRow(r) !== false : true; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
      continue;
    }
    if (c === '"' && field === "") { quoted = true; continue; }
    if (c === delim) { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      if (!emit()) return;
      continue;
    }
    field += c;
  }
  if (field !== "" || row.length) emit();
}

export function parseDelimited(text: string, delim: string, limit = Infinity): string[][] {
  const rows: string[][] = [];
  eachRow(text, delim, (r) => { rows.push(r); return rows.length < limit; });
  return rows;
}

const H = (h: string) => h.trim().toLowerCase().replace(/[\s_]+/g, " ");
const UPC_HEADERS = ["upc", "ean", "upc/ean", "upc ean", "barcode", "product upc", "release upc", "upc code"];
const ISRC_HEADERS = ["isrc", "track isrc", "isrc code"];
const AMOUNT_HEADERS = ["earnings (usd)", "net revenue", "net earnings", "royalty", "royalties", "net amount", "net payable", "payable", "earnings", "revenue", "amount", "total", "net", "label share", "income"];
const CURRENCY_HEADERS = ["currency", "currency code", "payment currency", "reporting currency"];
const QTY_HEADERS = ["quantity", "units", "streams", "qty", "count"];

export type Mapping = { upc: number; isrc: number; amount: number; currency: number; decimal: "." | "," };

/** Best guess at which column is which. The importer shows it and the label can change it. */
export function guessMapping(headers: string[], sample: string[][]): Mapping {
  const hs = headers.map(H);
  const find = (names: string[]) => { for (const n of names) { const i = hs.indexOf(n); if (i >= 0) return i; } return hs.findIndex((h) => names.some((n) => h.includes(n))); };
  const amount = find(AMOUNT_HEADERS);
  return { upc: find(UPC_HEADERS), isrc: find(ISRC_HEADERS), amount, currency: find(CURRENCY_HEADERS), decimal: guessDecimal(sample.map((r) => r[amount] ?? "")) };
}
export const quantityColumn = (headers: string[]) => headers.map(H).findIndex((h) => QTY_HEADERS.includes(h));

/**
 * "." or ",": whichever the amounts use as a decimal point. A value with both says it by which
 * comes last. "0,125" is a decimal comma (no thousands group starts with 0); "1,250" could be
 * either, so it isn't counted, and the importer shows a parsed sample for the label to check.
 */
export function guessDecimal(values: string[]): "." | "," {
  let dot = 0, comma = 0;
  for (const raw of values.slice(0, 500)) {
    const v = raw.trim().replace(/[\s\u00A0\u202F]/g, "");
    if (/[eE][+-]?\d+$/.test(v)) { dot++; continue; }
    const d = v.lastIndexOf("."), c = v.lastIndexOf(",");
    if (d > c) dot++;
    else if (c > d && (!/^[-−–(]?\d{1,3},\d{3}\)?$/.test(v) || /^[-−–(]?0,/.test(v))) comma++;
  }
  return comma > dot ? "," : ".";
}

const MINUS = /[\u2212\u2013\u2012\u2014]/g; // − – ‒ —: spreadsheets and PDFs turn "-" into these
const EXPONENT = /^(\d*)(?:\.(\d*))?[eE]([+-]?\d{1,3})$/;

/**
 * One amount as an integer at 1e-12, or null if it isn't a number. Accepts currency symbols,
 * spaces (including non-breaking ones) and thousands separators; a minus before or after the
 * number, typographic minus signs, or accounting brackets for a negative (refunds and chargebacks
 * are real lines); and exponent notation, which distributors use for fractions of a cent
 * ("1.2E-05"). Digits past the twelfth place are dropped.
 */
export function parseAmount(raw: string, decimal: "." | ","): bigint | null {
  let v = raw.trim().replace(MINUS, "-").replace(/[\s\u00A0\u202F']/g, "");
  // Currency symbols and codes either side ("$", "AUD", "EUR") go first, so "1.00EUR" and "$(1.00)" read right.
  const strip = () => { v = v.replace(/^[^\d.,()+-]+/, "").replace(/[^\d.,()+-]+$/, ""); };
  strip();
  if (!v) return null;
  let neg = false;
  if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); strip(); }
  if (v.endsWith("-")) { neg = !neg; v = v.slice(0, -1); }
  if (v.startsWith("+")) v = v.slice(1);
  else if (v.startsWith("-")) { neg = !neg; v = v.slice(1); }
  strip();
  if (/[eE]/.test(v)) {
    // Exponent notation always uses a dot in practice; with a decimal comma it may carry a comma.
    const em = EXPONENT.exec(decimal === "," ? v.replace(",", ".") : v);
    if (!em || !(em[1] || em[2])) return null;
    const exp = Number(em[3]);
    if (exp > 15 || exp < -30) return null;
    const digits = `${em[1]}${em[2] ?? ""}`.replace(/^0+(?=\d)/, "") || "0";
    if (digits.length > 30) return null;
    const shift = exp - (em[2]?.length ?? 0) + 12; // digits × 10^shift, at 1e-12
    const n = shift >= 0 ? BigInt(digits) * 10n ** BigInt(shift) : BigInt(digits) / 10n ** BigInt(-shift);
    if (n >= MAX_AMOUNT) return null;
    return neg ? -n : n;
  }
  if (!/^[\d.,]+$/.test(v)) return null;
  const thousands = decimal === "." ? "," : ".";
  v = v.split(thousands).join("");
  const parts = v.split(decimal);
  if (parts.length > 2) return null;
  if (!parts[0] && !parts[1]) return null;
  if (parts[0].length > 15) return null; // a quadrillion units isn't a royalty line
  const whole = BigInt(parts[0] || "0");
  const frac = (parts[1] ?? "").slice(0, 12).padEnd(12, "0");
  const n = whole * SCALE + BigInt(frac);
  return neg ? -n : n;
}
/** 10^15 units, at 1e-12: past this no single line is a royalty, and the server's micros would overflow. */
const MAX_AMOUNT = 10n ** 27n;

/** Digits only, without leading zeros: a 12-digit UPC and the same product's 13-digit EAN match. */
export const normUpc = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^0+/, "");
/** Twelve letters and digits, upper case, hyphens and spaces gone. Anything else isn't an ISRC. */
export const normIsrc = (v: string | null | undefined) => { const s = (v ?? "").replace(/[\s-]/g, "").toUpperCase(); return /^[A-Z0-9]{12}$/.test(s) ? s : ""; };

/** Round half away from zero from 1e-12 to millionths. */
function toMicros(n: bigint) {
  const neg = n < 0n, a = neg ? -n : n;
  const m = (a + TO_MICROS / 2n) / TO_MICROS;
  return neg ? -m : m;
}

export type StatementPair = { upc: string; isrc: string; micros: string; rows: number };
export type Aggregate = { pairs: StatementPair[]; rowsTotal: number; skipped: number; currencies: string[] };

/**
 * Sum a statement by UPC and ISRC, a row at a time. Rows with no identifier or no readable amount
 * are counted as skipped rather than guessed at. Each UPC/ISRC total is rounded once, to
 * millionths. `micros` is a string because BigInt doesn't JSON.
 */
export function aggregateRows(each: (cb: (r: string[]) => void) => void, m: Mapping): Aggregate {
  const sums = new Map<string, { upc: string; isrc: string; n: bigint; rows: number }>();
  const currencies = new Set<string>();
  let skipped = 0, total = 0;
  each((r) => {
    total++;
    const upc = m.upc >= 0 ? normUpc(r[m.upc]) : "";
    const isrc = m.isrc >= 0 ? normIsrc(r[m.isrc]) : "";
    const amt = m.amount >= 0 ? parseAmount(r[m.amount] ?? "", m.decimal) : null;
    if ((!upc && !isrc) || amt === null) { skipped++; return; }
    if (m.currency >= 0) { const c = (r[m.currency] ?? "").trim().toUpperCase(); if (c) currencies.add(c); }
    const key = `${upc}|${isrc}`;
    const e = sums.get(key) ?? { upc, isrc, n: 0n, rows: 0 };
    e.n += amt; e.rows++;
    sums.set(key, e);
  });
  return { pairs: [...sums.values()].map((e) => ({ upc: e.upc, isrc: e.isrc, micros: toMicros(e.n).toString(), rows: e.rows })), rowsTotal: total, skipped, currencies: [...currencies] };
}
/** Rows already in memory (tests, small files). */
export const aggregate = (rows: string[][], m: Mapping) => aggregateRows((cb) => rows.forEach(cb), m);
/** A whole file's text, skipping the header row, without ever holding every row. */
export const aggregateText = (text: string, delim: string, m: Mapping) =>
  aggregateRows((cb) => { let first = true; eachRow(text, delim, (r) => { if (first) { first = false; return; } cb(r); }); }, m);

/**
 * Split an amount by shares so the parts add up to it exactly: each takes the floor of its exact
 * share, then the leftover millionths go one each to the largest remainders (ties to the order
 * given). Negative amounts split the same way, mirrored.
 */
export function allocate(micros: bigint, shares: { key: string; bps: number }[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  const neg = micros < 0n, a = neg ? -micros : micros;
  const total = BigInt(TOTAL_BPS);
  const rows = shares.map((s, i) => { const exact = a * BigInt(s.bps); return { key: s.key, i, base: exact / total, rem: exact % total }; });
  let left = a - rows.reduce((n, r) => n + r.base, 0n);
  for (const r of [...rows].sort((x, y) => (y.rem === x.rem ? x.i - y.i : y.rem > x.rem ? 1 : -1))) {
    if (left <= 0n) break;
    if (r.rem === 0n) continue;
    r.base += 1n; left -= 1n;
  }
  for (const r of rows) out.set(r.key, (out.get(r.key) ?? 0n) + (neg ? -r.base : r.base));
  return out;
}

/** Millionths as an exact decimal string: -1234567n → "-1.234567". No float anywhere. */
export function microsToDecimal(micros: bigint | string) {
  const n = BigInt(micros), neg = n < 0n, a = neg ? -n : n;
  return `${neg ? "-" : ""}${a / 1_000_000n}.${(a % 1_000_000n).toString().padStart(6, "0")}`;
}

/** 12345678 millionths of AUD → "A$12.35". For display only: statements keep the millionths. */
export function money(micros: bigint | string | number, currency: string) {
  const n = typeof micros === "bigint" ? micros : BigInt(micros);
  const cents = Number((n < 0n ? n - 5_000n : n + 5_000n) / 10_000n) / 100;
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents); } catch { return `${cents.toFixed(2)} ${currency}`; }
}
export const isCurrency = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{3}$/.test(c);
