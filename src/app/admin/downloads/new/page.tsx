import { requireUser } from "@/lib/auth";
import { DownloadForm } from "@/components/admin/download-form";
import { getSoundCloudCreds } from "@/lib/soundcloud";

export const dynamic = "force-dynamic";
export const metadata = { title: "New download" };

export default async function NewDownloadPage() {
  const user = await requireUser("label");
  const sc = await getSoundCloudCreds(user.organizationId);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New download</h1>
      <DownloadForm soundcloudConnected={!!sc} />
    </div>
  );
}
