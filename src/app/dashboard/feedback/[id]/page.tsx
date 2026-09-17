import { FeedbackThreadPage } from "@/components/feedback/feedback-pages";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Feedback" };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser("artist"), props.params]);
  return <FeedbackThreadPage user={user} base="/dashboard/feedback" id={id} />;
}
