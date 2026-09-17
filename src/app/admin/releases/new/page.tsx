import { ReleaseCreateForm } from "@/components/admin/release-create-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateToZonedLocal, zonedDay, zonedLocalToDate } from "@/lib/time";

export default async function NewRelease(props: { searchParams: Promise<{ type?: string }> }) {
  const searchParams = await props.searchParams;
  const smart = searchParams.type === "smartlink";
  const user = await requireUser("label");
  const artists = await prisma.user.findMany({ where: { organizationId: user.organizationId, role: "artist" }, orderBy: { artistName: "asc" } });
  // Default: next Friday 00:00 in the label's timezone
  const tz = user.organization.timezone;
  const today = zonedDay(new Date(), tz);
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const add = ((5 - dow + 7) % 7) || 7;
  const fridayDay = new Date(Date.UTC(y, m - 1, d + add)).toISOString().slice(0, 10);
  const friday = zonedLocalToDate(`${fridayDay}T00:00`, tz);
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
      <ReleaseCreateForm artists={artists.map((a) => ({ id: a.id, name: a.artistName ?? a.email }))} defaultDate={dateToZonedLocal(smart ? new Date(Date.now() - 60_000) : friday, tz)} locationLabel={user.organization.locationLabel} />
    </div>
  );
}
