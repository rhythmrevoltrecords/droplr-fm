import { hasBeta } from "@/lib/beta";
import { NextResponse, type NextRequest } from "next/server";
import { labelRelease } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { bpsToPercent, parseSheet } from "@/lib/royalties";
import { newAddresses, royaltiesAllowed, saveSheet } from "@/lib/royalties-server";

/**
 * PUT { parties: [{ id?, name, email?, role, share }] }: save the whole split sheet. Starting one
 * needs a plan with royalties; changing one that exists never does.
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!hasBeta(g.user.organization, "royalties")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (g.release.kind !== "release") return NextResponse.json({ error: "Split sheets are for releases, not download gates." }, { status: 400 });
  const parsed = parseSheet(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // Starting a sheet, or putting a new address on one, is creating: droplr will email that person.
  // Changing shares, names or roles on a sheet that exists never needs a plan.
  const exists = await prisma.splitSheet.findUnique({ where: { releaseId: g.release.id }, select: { id: true } });
  const gate = royaltiesAllowed(g.user.organization);
  if (!gate.can && (!exists || (await newAddresses(g.release.id, parsed.ok)).length)) {
    return NextResponse.json({ error: gate.why === "artist" ? "Split sheets are for label accounts." : exists ? "Adding someone new to a split sheet is on the Pro and Label plans. You can still change shares for the people already on it." : "Split sheets are on the Pro and Label plans." }, { status: 402 });
  }
  try {
    const sheet = await saveSheet(g.release, parsed.ok);
    // The saved parties, ids included, so the editor's next save updates them instead of replacing them.
    return NextResponse.json({ ok: true, version: sheet.version, parties: sheet.parties.map((pt) => ({ id: pt.id, name: pt.name, email: pt.email ?? "", role: pt.role, share: bpsToPercent(pt.shareBps) })) });
  } catch (e) {
    if (e instanceof Error && e.message === "UNKNOWN_PARTY") return NextResponse.json({ error: "That person isn't on this sheet. Reload and try again." }, { status: 400 });
    throw e;
  }
}

/** DELETE: remove the sheet. Statements already calculated keep their figures and names. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await labelRelease(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!hasBeta(g.user.organization, "royalties")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.splitSheet.deleteMany({ where: { releaseId: g.release.id, organizationId: g.user.organizationId } });
  return NextResponse.json({ ok: true });
}
