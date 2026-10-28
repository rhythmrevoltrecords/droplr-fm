import { type NextRequest } from "next/server";
import { recordConsentEvent } from "@/lib/consent-events";
import { verifyToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { prefsPage } from "@/lib/email-prefs";
import { confirmNews } from "@/lib/news-confirm";

export const dynamic = "force-dynamic";

/**
 * The button in the "Is this you?" email (lib/news-confirm). GET only asks, POST acts: mail
 * scanners and inbox previews open every link in an email, and a GET that confirmed would put
 * the very addresses this exists to protect onto lists without anyone pressing anything.
 */
const expired = () => prefsPage(`<h1>Link expired</h1><p>This confirmation link is invalid or has expired. Tick the box again on the page you came from and a new one will be sent.</p>`, 400);

async function load(t: string | null) {
  const tok = await verifyToken<{ e: string; org: string }>(t, "confirm");
  if (!tok || typeof tok.e !== "string" || typeof tok.org !== "string") return null;
  const org = await prisma.organization.findFirst({ where: { id: tok.org, suspendedAt: null }, select: { id: true, name: true } });
  return org ? { email: tok.e, org } : null;
}

const clean = (s: string) => s.replace(/[<>&"]/g, "");

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  const got = await load(t);
  if (!got || !t) return expired();
  return prefsPage(
    `<h1>Get news from ${clean(got.org.name)}?</h1>
     <p>New music and news, sent to ${clean(got.email)}. Every email has an unsubscribe link.</p>
     <form method="post" action="/api/news/confirm?t=${encodeURIComponent(t)}" style="margin-top:28px">
       <button style="background:#fafafa;color:#09090b;border:0;border-radius:10px;padding:12px 20px;font:600 15px system-ui;cursor:pointer">Yes, send me news</button>
     </form>
     <p style="color:#71717a;font-size:13px;margin-top:16px">Nothing happens unless you press that.</p>`,
  );
}

export async function POST(req: NextRequest) {
  const got = await load(req.nextUrl.searchParams.get("t"));
  if (!got) return expired();
  const changed = await confirmNews(got.org.id, got.email);
  if (changed === 0) {
    // Already confirmed, unsubscribed since, or the tick is gone. Saying "you're in" would be untrue
    // for two of those three, so say what is true for all of them.
    return prefsPage(`<h1>Nothing to confirm</h1><p>There's no waiting signup for this address. If you unsubscribed since, that still stands.</p>`);
  }
  await recordConsentEvent(got.org.id, got.email, "confirm", "link");
  return prefsPage(`<h1>You're in</h1><p>You'll get news from ${clean(got.org.name)}. Every email has an unsubscribe link.</p>`);
}
