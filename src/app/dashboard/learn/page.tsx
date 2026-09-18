import { GuideCards } from "@/components/learn/learn-ui";
import { LEGAL_NOTE } from "@/lib/learn";

export const metadata = { title: "Knowledge" };

export default function LearnHome() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="mt-1 text-muted-foreground">Guides for releasing your own music: getting paid, distribution, promo tools, and the business side. Open on every plan.</p>
      </div>
      <GuideCards base="/dashboard/learn" />
      <p className="text-sm text-muted-foreground">Need the paperwork? <a href="/dashboard/templates" className="underline hover:text-foreground">Printable templates</a>: splits sheet, release metadata, release checklist, press one-pager.</p>
      <p className="text-xs text-muted-foreground">{LEGAL_NOTE}</p>
    </div>
  );
}
