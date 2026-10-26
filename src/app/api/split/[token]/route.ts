import { NextResponse, type NextRequest } from "next/server";
import { answerSheet } from "@/lib/royalties-server";
import { ipKey, hit } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/**
 * POST { action: "confirm" | "dispute", version, note? } from the link in a split sheet email.
 * The page at /split/[token] only shows; this is the only thing that changes anything, so a mail
 * scanner following the link confirms nothing.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await hit(ipKey("split-answer", ip), 30, 3_600_000)).ok) return NextResponse.json({ error: "Too many tries. Wait a while and try again." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; version?: unknown; note?: unknown };
  if ((b.action !== "confirm" && b.action !== "dispute") || typeof b.version !== "number" || !Number.isInteger(b.version)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await answerSheet(token, b.action, b.version, typeof b.note === "string" ? b.note.trim() : null);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
