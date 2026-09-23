import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import {
  extractContacts, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_NO_CONSENT,
  IMPORT_NO_EMAILS, IMPORT_TOO_BIG, IMPORT_TOO_MANY, isConsentKind, isConsentSource, parseCsv,
} from "@/lib/fan-import";
import { importContacts } from "@/lib/fan-import-server";
import { planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Import a list the label already had.
 *
 * Refuses without provenance on purpose. Under the Spam Act the sender carries the burden of
 * showing consent no matter which tool the addresses came from, so "where from, when, and what
 * did they agree to" is required input, not an optional nicety — and it's stored verbatim.
 *
 * Nothing here can reach a release-day send: imported addresses become FanContact rows, and
 * release-day sending reads PreSave scoped to a releaseId. They're reachable only by a news
 * email the label composes and sends deliberately.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  // Importing is only useful if you can email them, and that's a paid feature.
  if (!planOf(user.organization.plan).newsEmails) {
    return NextResponse.json({ error: "Importing a fan list needs a paid plan." }, { status: 402 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > IMPORT_MAX_BYTES) return NextResponse.json({ error: IMPORT_TOO_BIG }, { status: 400 });

  const consentSource = String(form?.get("consentSource") ?? "").trim();
  const consentKindRaw = String(form?.get("consentKind") ?? "");
  const consentNote = String(form?.get("consentNote") ?? "").trim().slice(0, 500);
  const consentAtRaw = String(form?.get("consentAt") ?? "").trim();
  const attested = String(form?.get("attested") ?? "") === "yes";

  if (!isConsentSource(consentSource) || !isConsentKind(consentKindRaw) || !consentNote || !attested) {
    return NextResponse.json({ error: IMPORT_NO_CONSENT }, { status: 400 });
  }
  const consentAt = consentAtRaw && !Number.isNaN(Date.parse(consentAtRaw)) ? new Date(consentAtRaw) : null;

  const rows = parseCsv(await file.text());
  if (rows.length > IMPORT_MAX_ROWS + 1) return NextResponse.json({ error: IMPORT_TOO_MANY }, { status: 400 });
  const { contacts, skipped } = extractContacts(rows);
  if (contacts.length === 0) return NextResponse.json({ error: IMPORT_NO_EMAILS }, { status: 400 });

  try {
    const result = await importContacts({
      organizationId: user.organizationId,
      importedBy: user.email,
      contacts, skipped,
      consentSource, consentKind: consentKindRaw, consentAt, consentNote,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[fan import]", e);
    return NextResponse.json({ error: "Import failed. Try again." }, { status: 500 });
  }
}
