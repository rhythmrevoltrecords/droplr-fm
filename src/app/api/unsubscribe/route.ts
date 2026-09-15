import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

async function unsubscribe(t: string | null) {
  const tok = await verifyToken<{ ps: string; act: string }>(t);
  if (!tok || tok.act !== "unsub") return null;
  const ps = await prisma.preSave.findUnique({ where: { id: tok.ps }, include: { release: { include: { organization: true } } } });
  if (!ps?.email) return null;
  // Unsubscribe this address from every release of this label
  await prisma.preSave.updateMany({
    where: { email: ps.email, release: { organizationId: ps.release.organizationId } },
    data: { emailConsent: false },
  });
  await prisma.preSave.updateMany({
    where: { email: ps.email, platform: "email", release: { organizationId: ps.release.organizationId } },
    data: { status: "unsubscribed" },
  });
  return ps.release.organization.name;
}

export async function GET(req: NextRequest) {
  const org = await unsubscribe(req.nextUrl.searchParams.get("t"));
  const body = org
    ? `<h1>You're unsubscribed</h1><p>You won't get release emails from ${org.replace(/[<>&]/g, "")} anymore.</p>`
    : `<h1>Link expired</h1><p>This unsubscribe link is invalid or expired.</p>`;
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="background:#09090b;color:#fafafa;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div>${body}</div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: org ? 200 : 400 },
  );
}

// RFC 8058 one-click unsubscribe
export async function POST(req: NextRequest) {
  const org = await unsubscribe(req.nextUrl.searchParams.get("t"));
  return NextResponse.json({ ok: !!org }, { status: org ? 200 : 400 });
}
