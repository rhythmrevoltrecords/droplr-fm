import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { calculate } from "@/lib/royalties-server";

/** POST: work the statement out again from the split sheets as they're confirmed now. Never gated. */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await apiUser("label");
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!hasBeta(user.organization, "royalties")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await props.params;
  const n = await calculate(id, user.organizationId);
  if (n === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, allocations: n });
}
