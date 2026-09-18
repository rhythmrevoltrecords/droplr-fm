import { notFound } from "next/navigation";
import { NewsComposer } from "@/components/admin/news-composer";
import { requireUser } from "@/lib/auth";
import { newsOptions } from "@/lib/news-options";
import { canSendNews } from "@/lib/news";

export const dynamic = "force-dynamic";
export const metadata = { title: "Write a fan email" };

export default async function NewNewsPage() {
  const user = await requireUser("label");
  const org = user.organization;
  if (!canSendNews(org.plan)) notFound();
  const opts = await newsOptions(org.id);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Write a fan email</h1>
      <NewsComposer
        draft={{ subject: "", body: "", buttonLabel: "", buttonUrl: "", filterCountry: "", filterListenOn: "", filterReleaseId: "" }}
        orgName={org.emailFromName || org.name}
        timezone={org.timezone}
        status="draft"
        {...opts}
      />
    </div>
  );
}
