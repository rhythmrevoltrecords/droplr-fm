import { ReleaseCreateForm } from "@/components/admin/release-create-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateToBrisbaneLocal } from "@/lib/time";

export default async function NewRelease({ searchParams }: { searchParams: { type?: string } }) {
  const smart = searchParams.type === "smartlink";
  const user = await requireUser("label");
  const artists = await prisma.user.findMany({ where: { organizationId: user.organizationId, role: "artist" }, orderBy: { artistName: "asc" } });
  // Default: next Friday 00:00 Brisbane
  const now = new Date(Date.now() + 10 * 3600_000);
  const add = ((5 - now.getUTCDay() + 7) % 7) || 7;
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, 0, 0) - 10 * 3600_000);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{smart ? "New music smart link" : "New pre-save link"}</h1>
        <p className="text-sm text-muted-foreground">
          {smart
            ? "Paste a released track. Every platform is pulled in and the page goes straight to the smart link view."
            : "Paste an upcoming release. Fans pre-save until the release date, then the same link becomes a smart link."}
        </p>
      </div>
      <ReleaseCreateForm artists={artists.map((a) => ({ id: a.id, name: a.artistName ?? a.email }))} defaultDate={dateToBrisbaneLocal(smart ? new Date(Date.now() - 60_000) : friday)} />
    </div>
  );
}
