import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { checkOrgDomain } from "@/lib/domains";
import { UNVERIFIED_ERROR } from "@/lib/email-verification";
import { hit } from "@/lib/throttle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST: "Check now" for the label's custom domain (TXT → Netlify alias → HTTPS). */
export async function POST() {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: UNVERIFIED_ERROR }, { status: 403 });
  if (!user.organization.customDomain) return NextResponse.json({ error: "Save a domain first" }, { status: 400 });
  if (!(await hit(`domain-check:${user.organizationId}`, 10, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Checked a lot just now. Give DNS a few minutes, then try again." }, { status: 429 });
  }
  const view = await checkOrgDomain(user.organizationId);
  if (!view) return NextResponse.json({ error: "Save a domain first" }, { status: 400 });
  const message = view.state === "live" ? "Connected. New links use your domain." : view.error ?? "Checked";
  return NextResponse.json({ ok: view.state === "live", view, message });
}
