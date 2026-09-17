import { FeedbackListPage } from "@/components/feedback/feedback-pages";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Feedback" };

export default async function Page(props: { searchParams: Promise<{ from?: string }> }) {
  const [user, sp] = await Promise.all([requireUser("artist"), props.searchParams]);
  return <FeedbackListPage user={user} base="/dashboard/feedback" from={sp.from} />;
}
