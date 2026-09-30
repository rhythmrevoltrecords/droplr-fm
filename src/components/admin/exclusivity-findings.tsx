import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Finding } from "@/lib/exclusivity";

/**
 * Whether the links on this release break its store exclusivity.
 *
 * The reason this panel can exist at all: droplr holds the exclusivity window and the list of links
 * scheduled on the same record. Beatport knows the window and not the links; the distributor knows
 * the window and not the links; the label knows both and is the one who forgets.
 *
 * Follows the metadata panel's rule — silence when there's nothing wrong. A release with no
 * exclusive set renders nothing at all (the caller drops the card), and a correct one shows a single
 * green line. The findings themselves always name the distributor whose rule is being applied,
 * because "LabelWorx counts this as a breach" is actionable and "this might be a problem" is not.
 */
export function ExclusivityFindings({ findings, summary }: { findings: Finding[]; summary: string | null }) {
  const errors = findings.filter((f) => f.level === "error");

  return (
    <Card id="exclusivity" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">Exclusivity</CardTitle>
        <CardDescription>
          {summary ? <strong className="text-foreground">{summary}</strong> : "No exclusive set."}{" "}
          Beatport, LabelWorx and Symphonic publish different rules about what breaks an exclusive, so droplr answers
          under the distributor you picked and names it. Worth knowing: Beatport&apos;s Hype eligibility is labels under
          US$25,000 of Beatport sales in the trailing twelve months, and losing an exclusive can cost the premium price
          point as well as the chart.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {findings.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Nothing on this page breaks it.
          </p>
        )}

        {findings.map((f, i) => {
          const tone =
            f.level === "error" ? "border-red-500/40 bg-red-500/[0.07]"
            : f.level === "warning" ? "border-amber-500/40 bg-amber-500/[0.06]"
            : "border-white/10 bg-white/[0.03]";
          return (
            <div key={`${f.level}-${f.platform ?? "all"}-${i}`} className={`rounded-lg border p-3 text-sm ${tone}`}>
              <p className="flex items-start gap-2">
                {f.level === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
                  : f.level === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                  : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                <span>{f.text}</span>
              </p>
            </div>
          );
        })}

        {errors.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Hiding a link keeps it on the record and off the page, so you can put it back the day the window closes
            without rebuilding anything.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
