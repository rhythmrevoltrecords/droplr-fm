import { NextResponse, type NextRequest } from "next/server";
import { markUnsubscribedByEmail } from "@/lib/esp/db";
import { verifyEspWebhook } from "@/lib/esp/webhook";

export const dynamic = "force-dynamic";

// Mailchimp verifies the endpoint with a GET before it will save it.
export async function GET() {
  return NextResponse.json({ ok: true });
}

// Mailchimp posts form-encoded events. We act only on unsubscribe/cleaned/spam, and only when the
// per-org token in the URL checks out.
export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("org");
  const token = req.nextUrl.searchParams.get("token");
  if (!orgId || !verifyEspWebhook(orgId, token)) return NextResponse.json({ error: "bad token" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: true }); // nothing to do; never make Mailchimp retry

  const type = String(form.get("type") ?? "");
  const email = String(form.get("data[email]") ?? "");
  if ((type === "unsubscribe" || type === "cleaned" || type === "spam") && email) {
    await markUnsubscribedByEmail(orgId, email).catch(() => 0);
  }
  return NextResponse.json({ ok: true });
}
