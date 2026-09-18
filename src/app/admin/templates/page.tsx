import { FileText } from "lucide-react";
import Link from "next/link";
import { TEMPLATE_NOTE, TEMPLATES } from "@/lib/templates";

export const metadata = { title: "Templates" };

export default function TemplatesHome() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="mt-1 text-muted-foreground">Print them, sign them, or copy the text into Docs. Free on every plan.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <Link key={t.slug} href={`/admin/templates/${t.slug}`} className="group rounded-2xl border p-5 transition-colors hover:border-violet-400/40 hover:bg-white/[0.03]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5 text-violet-300" aria-hidden /> {t.tag}</div>
            <h2 className="mt-2.5 font-semibold">{t.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.summary}</p>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{TEMPLATE_NOTE}</p>
    </div>
  );
}
