import { ReleaseCreateForm } from "@/components/admin/release-create-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateToBrisbaneLocal } from "@/lib/time";

export default async function NewRelease() {
  const user = await requireUser("label");
  const artists = await prisma.user.findMany({ where: { organizationId: user.organizationId, role: "artist" }, orderBy: { artistName: "asc" } });
  // Default: next Friday 00:00 Brisbane
  const now = new Date(Date.now() + 10 * 3600_000);
  const add = ((5 - now.getUTCDay() + 7) % 7) || 7;
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, 0, 0) - 10 * 3600_000);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New release</h1>
      <ReleaseCreateForm artists={artists.map((a) => ({ id: a.id, name: a.artistName ?? a.email }))} defaultDate={dateToBrisbaneLocal(friday)} />
    </div>
  );
}
