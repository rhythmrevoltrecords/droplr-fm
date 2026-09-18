import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplateDoc } from "@/components/templates/template-doc";
import { Card } from "@/components/ui/card";
import { TEMPLATES } from "@/lib/templates";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  return { title: TEMPLATES.find((t) => t.slug === slug)?.title ?? "Template" };
}

export default async function TemplatePage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ sample?: string }> }) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const template = TEMPLATES.find((t) => t.slug === slug);
  if (!template) notFound();
  const sample = sp.sample === "1";
  return (
    <div className="space-y-6">
      <div className="no-print max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground"><Link href="/admin/templates" className="hover:underline">Templates</Link> / {template.tag}</p>
        <div>
          <h1 className="text-2xl font-semibold">{template.title}</h1>
          <p className="mt-1 text-muted-foreground">{template.summary}</p>
        </div>
        <Card className="p-4">
          <ul className="ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">{template.why.map((w) => <li key={w}>{w}</li>)}</ul>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          <TemplateActions text={template.text} />
          <Link href={`/admin/templates/${template.slug}${sample ? "" : "?sample=1"}`} className="text-sm text-muted-foreground underline hover:text-foreground">
            {sample ? "Show the blank template" : "Show a filled-in example"}
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Print, then choose <strong>Save as PDF</strong> as the printer. The blank template prints without the watermark.</p>
      </div>
      <TemplateDoc template={template} sample={sample} />
    </div>
  );
}
