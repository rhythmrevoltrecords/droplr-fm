import { BioForm } from "@/components/admin/bio-form";
import { requireUser } from "@/lib/auth";
import { planOf } from "@/lib/plans";

export default async function NewBio() {
  const user = await requireUser("label");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New bio link</h1>
      <BioForm
        mode="create"
        initial={{ title: "", slug: "", bio: "", imageUrl: "", accentColor: "", isPublic: true }}
        orgName={user.organization.name}
        showBranding={!planOf(user.organization.plan).removeBranding}
        previewLinks={[{ id: "p1", platform: "spotify", label: "Latest release" }, { id: "p2", platform: "bandcamp", label: "Merch" }]}
      />
    </div>
  );
}
