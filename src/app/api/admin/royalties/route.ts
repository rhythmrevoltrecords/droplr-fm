import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { parseDay } from "@/lib/agreements";
import { isCurrency, SPLIT_LIMITS, type StatementPair } from "@/lib/royalties";
import { createImport, royaltiesAllowed } from "@/lib/royalties-server";

export const dynamic = "force-dynamic";

const MICROS = /^-?\d{1,18}$/;

/**
 * POST { title, currency, periodStart?, periodEnd?, rowsTotal, pairs: [{ upc, isrc, micros, rows }] }.
 * The file was parsed in the browser; only these totals arrive. Each is checked for shape and
 * size, then matched against the caller's own releases.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!hasBeta(user.organization, "royalties")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = royaltiesAllowed(user.organization);
  if (!gate.can) return NextResponse.json({ error: gate.why === "artist" ? "Statements are for label accounts." : "Statements are on the Pro and Label plans." }, { status: 402 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const title = typeof b.title === "string" ? b.title.trim().replace(/\s+/g, " ") : "";
  if (!title || title.length > SPLIT_LIMITS.title) return NextResponse.json({ error: `Give the statement a name under ${SPLIT_LIMITS.title} characters.` }, { status: 400 });
  if (!isCurrency(b.currency)) return NextResponse.json({ error: "Pick the statement's currency." }, { status: 400 });
  const ps = parseDay(b.periodStart), pe = parseDay(b.periodEnd);
  if (ps === "bad" || pe === "bad" || (ps && pe && pe < ps)) return NextResponse.json({ error: "Those period dates don't work." }, { status: 400 });
  const rowsTotal = b.rowsTotal;
  if (typeof rowsTotal !== "number" || !Number.isInteger(rowsTotal) || rowsTotal < 0 || rowsTotal > SPLIT_LIMITS.rows) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const pairs = b.pairs;
  if (!Array.isArray(pairs) || !pairs.length) return NextResponse.json({ error: "Nothing in that file had a UPC or ISRC and an amount." }, { status: 400 });
  if (pairs.length > SPLIT_LIMITS.pairs) return NextResponse.json({ error: `That's more than ${SPLIT_LIMITS.pairs.toLocaleString()} different tracks. Split the file.` }, { status: 400 });
  const clean: StatementPair[] = [];
  let rows = 0;
  for (const x of pairs as Record<string, unknown>[]) {
    const upc = typeof x?.upc === "string" ? x.upc : "", isrc = typeof x?.isrc === "string" ? x.isrc : "";
    if (upc.length > 20 || isrc.length > 12 || (!upc && !isrc) || typeof x.micros !== "string" || !MICROS.test(x.micros) || typeof x.rows !== "number" || !Number.isInteger(x.rows) || x.rows < 1) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    rows += x.rows;
    clean.push({ upc, isrc, micros: x.micros, rows: x.rows });
  }
  if (rows > rowsTotal) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const id = await createImport(user.organizationId, { title, currency: b.currency, periodStart: ps, periodEnd: pe, rowsTotal, pairs: clean });
  return NextResponse.json({ ok: true, id });
}
