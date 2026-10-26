import { NextResponse, type NextRequest } from "next/server";
import { isBetaFeature } from "@/lib/beta";
import { prisma } from "@/lib/db";
import { platformAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

/**
 * POST { feature, on } — platform owner only: switch a beta feature on or off for one account.
 * One SQL statement, so two switches flipped at once can't undo each other. Never touches the
 * plan: a beta is whether the feature exists for the account, the plan is whether it can create.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const admin = await platformAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await props.params;
  const b = (await req.json().catch(() => ({}))) as { feature?: unknown; on?: unknown };
  if (!isBetaFeature(b.feature) || typeof b.on !== "boolean") return NextResponse.json({ error: "Send a feature and on: true or false" }, { status: 400 });
  const f = b.feature;
  const n = b.on
    ? await prisma.$executeRaw`UPDATE "Organization" SET "betaFeatures" = array_append(array_remove("betaFeatures", ${f}), ${f}) WHERE "id" = ${id}`
    : await prisma.$executeRaw`UPDATE "Organization" SET "betaFeatures" = array_remove("betaFeatures", ${f}) WHERE "id" = ${id}`;
  if (!n) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  console.info("[platform] beta", { org: id, feature: f, on: b.on, by: admin.email });
  return NextResponse.json({ ok: true });
}
