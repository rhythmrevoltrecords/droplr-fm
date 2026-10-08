import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { closeAccount, closeConfirmationMatches } from "@/lib/account-close";
import { apiUser, clearSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({ confirm: z.string().min(1).max(200) });

/**
 * Close the account. POST only, owner only, and the typed name has to match.
 *
 * The typed confirmation is friction against an accident, not against leaving: it is one step, it
 * sits on the same page as the export, and nothing here offers a discount or asks a second time.
 * A retention gauntlet is the thing droplr's own argument is against, and it would be the quotable
 * screenshot under every video on the channel.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "Only the account owner can close the account" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type the account name to confirm" }, { status: 400 });
  if (!closeConfirmationMatches(parsed.data.confirm, user.organization.name)) {
    return NextResponse.json({ error: "That doesn't match the account name" }, { status: 400 });
  }

  const { subscription } = await closeAccount(user.organizationId);
  // The session's user row went with the organisation, but the cookie did not: clear it so the next
  // request is a signed-out visitor rather than a session pointing at nothing.
  await clearSession();
  return NextResponse.json({ ok: true, subscription });
}
