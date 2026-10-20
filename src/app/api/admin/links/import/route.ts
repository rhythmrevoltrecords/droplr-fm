import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { importLinksFrom } from "@/lib/link-import-server";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

const body = z.object({ url: z.string().trim().min(1).max(500) });

/**
 * Read the links off somebody's existing link-in-bio page.
 *
 * Returns candidates only — nothing is written. The artist ticks what they want in the editor and
 * saves through the normal links route, which does its own validation.
 *
 * Throttled per account rather than per URL: a per-URL budget resets whenever the caller changes
 * the address, which makes it not a budget. This endpoint makes the server fetch a URL a person
 * typed, so the limit is the point, not a formality.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  if (!(await allow(`link-import:${user.organizationId}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "That's a lot of imports in an hour. Try again later." }, { status: 429 });
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the address of your other page" }, { status: 400 });

  const result = await importLinksFrom(parsed.data.url);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ links: result.links });
}
