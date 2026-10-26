/**
 * Contracts: the pure half. No database import, so the forms can share the limits and labels.
 *
 * An agreement is the label's own record of a deal: who it's with, what kind, the dates that
 * matter, a link to the signed document, and which releases it covers. droplr never reads the
 * document, never stores it and never interprets it. The dates are what droplr acts on: a
 * reminder before the notice date, so an option or a renewal isn't missed.
 */

export const AGREEMENT_KINDS = ["recording", "licence", "remix", "distribution", "publishing", "management", "other"] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];
export const KIND_LABEL: Record<AgreementKind, string> = {
  recording: "Recording", licence: "Licence", remix: "Remix", distribution: "Distribution", publishing: "Publishing", management: "Management", other: "Other",
};

export const AGREEMENT_STATUSES = ["draft", "sent", "signed", "ended"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const STATUS_LABEL: Record<AgreementStatus, string> = { draft: "Draft", sent: "Sent to sign", signed: "Signed", ended: "Ended" };

export const AGREEMENT_LIMITS = { title: 120, counterparty: 120, termsNote: 200, notes: 2000, url: 500, releases: 200, perAccount: 1000, maxNoticeDays: 365 };
/** Notice reminders fire this many days before the end date when no notice period is set. */
export const DEFAULT_NOTICE_DAYS = 30;

export type AgreementInput = {
  title: string;
  kind: AgreementKind;
  status: AgreementStatus;
  artistId: string | null;
  counterparty: string | null;
  signedOn: Date | null;
  startsOn: Date | null;
  endsOn: Date | null;
  noticeDays: number | null;
  documentUrl: string | null;
  termsNote: string | null;
  notes: string | null;
  releaseIds: string[];
};

/** "2027-03-01" → that calendar day at UTC midnight. A date the label typed is never moved by a timezone. */
export function parseDay(v: unknown): Date | null | "bad" {
  if (v === null || v === "" || v === undefined) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "bad";
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return "bad";
  const y = d.getUTCFullYear();
  return y < 1950 || y > 2150 ? "bad" : d;
}
export const dayString = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * The link to the signed document. https only, with a real hostname. It is shown as a link and
 * never fetched, so nothing beyond that is needed — but a javascript: or data: address would run
 * in the label's own browser when they click it.
 */
export function cleanDocumentUrl(v: unknown): string | null | "bad" {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  if (typeof v !== "string" || v.length > AGREEMENT_LIMITS.url) return "bad";
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return "bad";
    return u.toString();
  } catch {
    return "bad";
  }
}

const text = (v: unknown, max: number): string | null | "bad" => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return "bad";
  const t = v.trim();
  if (t.length > max) return "bad";
  return t || null;
};

/**
 * Validate an agreement from a request body. `partial` accepts any subset (an edit). Returns the
 * cleaned fields or the first problem in words. Ownership of artistId and releaseIds is checked
 * by the route, against the caller's account; this only checks their shape.
 */
export function parseAgreement(body: unknown, partial = false): { ok: Partial<AgreementInput> } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Partial<AgreementInput> = {};
  const has = (k: string) => k in b && b[k] !== undefined;

  if (has("title") || !partial) {
    const t = text(b.title, AGREEMENT_LIMITS.title);
    if (t === "bad" || !t) return { error: `Give it a name under ${AGREEMENT_LIMITS.title} characters.` };
    out.title = t.replace(/\s+/g, " ");
  }
  if (has("kind") || !partial) {
    const k = b.kind ?? "recording";
    if (!(AGREEMENT_KINDS as readonly unknown[]).includes(k)) return { error: "Pick what kind of agreement it is." };
    out.kind = k as AgreementKind;
  }
  if (has("status") || !partial) {
    const s = b.status ?? "draft";
    if (!(AGREEMENT_STATUSES as readonly unknown[]).includes(s)) return { error: "Pick where the agreement is up to." };
    out.status = s as AgreementStatus;
  }
  if (has("artistId")) {
    if (b.artistId !== null && (typeof b.artistId !== "string" || b.artistId.length > 40)) return { error: "That artist isn't on your roster." };
    out.artistId = (b.artistId as string | null) || null;
  }
  for (const [k, max, label] of [["counterparty", AGREEMENT_LIMITS.counterparty, "The other party's name"], ["termsNote", AGREEMENT_LIMITS.termsNote, "The terms line"], ["notes", AGREEMENT_LIMITS.notes, "Notes"]] as const) {
    if (!has(k)) continue;
    const t = text(b[k], max);
    if (t === "bad") return { error: `${label} has to be text under ${max} characters.` };
    out[k] = t;
  }
  for (const [k, label] of [["signedOn", "signed"], ["startsOn", "start"], ["endsOn", "end"]] as const) {
    if (!has(k)) continue;
    const d = parseDay(b[k]);
    if (d === "bad") return { error: `That ${label} date isn't a real date.` };
    out[k] = d;
  }
  if (out.startsOn && out.endsOn && out.endsOn < out.startsOn) return { error: "The end date is before the start date." };
  if (has("noticeDays")) {
    const n = b.noticeDays;
    if (n !== null && (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > AGREEMENT_LIMITS.maxNoticeDays)) return { error: `Notice is a whole number of days, up to ${AGREEMENT_LIMITS.maxNoticeDays}.` };
    out.noticeDays = n as number | null;
  }
  if (has("documentUrl")) {
    const u = cleanDocumentUrl(b.documentUrl);
    if (u === "bad") return { error: "The document link has to be an https address, like a Drive, Dropbox or DocuSign link." };
    out.documentUrl = u;
  }
  if (has("releaseIds")) {
    const r = b.releaseIds;
    if (!Array.isArray(r) || r.length > AGREEMENT_LIMITS.releases || r.some((x) => typeof x !== "string" || x.length > 40)) return { error: "Those releases aren't yours." };
    out.releaseIds = [...new Set(r as string[])];
  }
  return { ok: out };
}

/** The day notice has to be given by: the end date less the notice period. Null with no end date. */
export function noticeDay(a: { endsOn: Date | null; noticeDays: number | null }): Date | null {
  if (!a.endsOn) return null;
  return new Date(a.endsOn.getTime() - (a.noticeDays ?? DEFAULT_NOTICE_DAYS) * 86_400_000);
}

/** Where an agreement stands today, in words for a badge. `today` is "YYYY-MM-DD" in the account's timezone. */
export function standing(a: { status: string; endsOn: Date | null; noticeDays: number | null }, today: string): { tone: "ok" | "warn" | "muted"; text: string } | null {
  if (a.status !== "signed" || !a.endsOn) return null;
  const end = dayString(a.endsOn), notice = dayString(noticeDay(a));
  if (end < today) return { tone: "muted", text: `Ended ${end}` };
  if (notice <= today) return { tone: "warn", text: `Notice by ${notice}` };
  return { tone: "ok", text: `Runs to ${end}` };
}
