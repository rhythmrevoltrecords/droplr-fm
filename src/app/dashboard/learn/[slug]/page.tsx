import { notFound } from "next/navigation";
import { MemberGuide } from "@/components/learn/learn-ui";
import { GUIDES } from "@/lib/learn";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = GUIDES.find((g) => g.slug === slug);
  return { title: guide?.title ?? "Knowledge" };
}

export default async function MemberGuidePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) notFound();
  return <MemberGuide guide={guide} backHref="/dashboard/learn" />;
}
