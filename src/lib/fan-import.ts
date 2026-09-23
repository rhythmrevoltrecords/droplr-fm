
/**
 * Importing a list a label already had — the pure half.
 *
 * No database import in this file on purpose: the upload form is a client component, and one
 * `import { prisma }` here drags pg into the browser bundle and fails the build with
 * "Can't resolve 'tls'". Anything that touches the database lives in fan-import-server.ts.
 *
 * Importing a list a label already had.
 *
 * The rule this file exists to enforce: consent belongs to the label, not to the tool. A fan who
 * ticked "email me about new music" on a gate service consented to that artist, and moving the
 * record here doesn't undo it. What the law asks is that the sender can show who consented, when,
 * and to what — so every import records that, in the importer's own words, and refuses to run
 * without it.
 *
 * What it will NOT do is make a transactional address mailable. Someone who typed their email to
 * get a file, and ticked nothing, did not subscribe to anything. Those land as "pending" and have
 * to confirm before they can be sent to. That's not droplr being precious: one label's bad list
 * burns the sending domain every other artist on droplr shares.
 */

export const CONSENT_SOURCES = ["hypeddit", "toneden", "mailchimp", "mailerlite", "own-site", "bandcamp", "other"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];
export const isConsentSource = (v: unknown): v is ConsentSource => typeof v === "string" && (CONSENT_SOURCES as readonly string[]).includes(v);

/** marketing = they opted in to hear from this artist. transactional = they only ever gave it for a file. */
export const CONSENT_KINDS = ["marketing", "transactional"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];
export const isConsentKind = (v: unknown): v is ConsentKind => typeof v === "string" && (CONSENT_KINDS as readonly string[]).includes(v);

export const IMPORT_MAX_ROWS = 50_000;
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_TOO_BIG = `That file is over ${IMPORT_MAX_BYTES / 1024 / 1024}MB. Split it and import in parts.`;
export const IMPORT_TOO_MANY = `That's more than ${IMPORT_MAX_ROWS.toLocaleString()} rows. Split it and import in parts.`;
export const IMPORT_NO_CONSENT = "Say where the addresses came from and what people agreed to before importing them.";
export const IMPORT_NO_EMAILS = "No email addresses found. Check the file has an email column.";
export const IMPORT_ERRORS = [IMPORT_TOO_BIG, IMPORT_TOO_MANY, IMPORT_NO_CONSENT, IMPORT_NO_EMAILS];

/** Conservative: no display names, no quoted locals, no consecutive dots. Bad rows are skipped, not guessed at. */
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase().replace(/^<|>$/g, "");
export const isEmail = (v: string) => v.length <= 254 && EMAIL.test(v);

/** Header names these exports actually use, lowercased. Order matters: first match wins. */
const EMAIL_HEADERS = ["email", "email address", "e-mail", "emailaddress", "mail", "subscriber email", "contact email"];
const NAME_HEADERS = ["name", "full name", "first name", "firstname", "display name", "subscriber name"];
const COUNTRY_HEADERS = ["country", "country code", "country_code"];

/**
 * A CSV parser that handles quoting, because a real export has commas and newlines inside
 * quoted fields and a `split(",")` silently mangles every row after the first one.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Strip a UTF-8 BOM: Excel adds one and it otherwise becomes part of the first header.
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export type ParsedContact = { email: string; name?: string; country?: string };

/**
 * Pull addresses out of whatever shape the file is.
 *
 * Exports from different services agree on nothing, so rather than demanding a template this
 * looks for a known email header, and failing that scans every column for something that looks
 * like an address. A label shouldn't have to reformat a file to get their own list back.
 */
export function extractContacts(rows: string[][]): { contacts: ParsedContact[]; skipped: number } {
  if (rows.length === 0) return { contacts: [], skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const findCol = (names: string[]) => head.findIndex((h) => names.includes(h));
  let emailCol = findCol(EMAIL_HEADERS);
  const nameCol = findCol(NAME_HEADERS);
  const countryCol = findCol(COUNTRY_HEADERS);

  // No recognisable header: find the column that holds the most addresses and use that.
  let body = emailCol >= 0 ? rows.slice(1) : rows;
  if (emailCol < 0) {
    const width = Math.max(...rows.map((r) => r.length));
    let best = -1, bestHits = 0;
    for (let c = 0; c < width; c++) {
      const hits = rows.reduce((n, r) => n + (isEmail(normalizeEmail(r[c] ?? "")) ? 1 : 0), 0);
      if (hits > bestHits) { bestHits = hits; best = c; }
    }
    if (best < 0) return { contacts: [], skipped: rows.length };
    emailCol = best;
    body = rows;
  }

  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  let skipped = 0;
  for (const r of body) {
    const email = normalizeEmail(r[emailCol] ?? "");
    if (!isEmail(email)) { skipped++; continue; }
    if (seen.has(email)) continue; // duplicate inside the file itself
    seen.add(email);
    const name = nameCol >= 0 ? (r[nameCol] ?? "").trim().slice(0, 120) : "";
    const country = countryCol >= 0 ? (r[countryCol] ?? "").trim().toUpperCase() : "";
    contacts.push({ email, name: name || undefined, country: /^[A-Z]{2}$/.test(country) ? country : undefined });
  }
  return { contacts, skipped };
}
