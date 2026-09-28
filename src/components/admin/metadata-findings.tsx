import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Finding } from "@/lib/metadata-check";

/**
 * What a distributor would send back, shown while there's still time to act on it.
 *
 * Note the timing, because the panel's copy depends on it: droplr usually sits AFTER the distributor
 * in the workflow — the artist submits to DistroKid, DistroKid delivers to Spotify, and only then
 * does the artist paste the link in here. So this is a catch, not a pre-flight, and it says so. Most
 * of what it finds can still be corrected with the distributor before release day, which is a
 * smaller and more honest promise than "check this before you distribute".
 *
 * Silence is the design goal. A correct release shows one green line and nothing else, because a
 * panel that always has something to say is a panel people stop reading — and then the one finding
 * that would have saved their release day gets scrolled past with the rest.
 *
 * Every finding carries the rule it came from. An artist who is told "feat. goes in the artist
 * field" once and shown why will not do it again; one who is told "invalid title" learns nothing and
 * resents the tool.
 */
export function MetadataFindings({ findings }: { findings: Finding[] }) {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  return (
    <Card id="metadata-check" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">Metadata check</CardTitle>
        <CardDescription>
          The mechanical things stores reject releases for — the barcode, the ISRC, and the title rules from the Apple
          Music style guide. <strong className="text-foreground">Already sent this to your distributor?</strong> Most of
          it can still be fixed with them before release day. droplr doesn&apos;t send anything anywhere; this is a
          second pair of eyes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {findings.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Nothing to fix. Titles, barcode and ISRC all look right.
          </p>
        )}

        {[...errors, ...warnings].map((f) => {
          const bad = f.severity === "error";
          return (
            <div
              key={f.id}
              className={`rounded-lg border p-3 text-sm ${bad ? "border-red-500/40 bg-red-500/[0.07]" : "border-amber-500/40 bg-amber-500/[0.06]"}`}
            >
              <p className="flex items-start gap-2 font-medium">
                {bad
                  ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />}
                <span>{f.message}</span>
              </p>
              {f.fix && <p className="mt-1 pl-6 text-muted-foreground">{f.fix}</p>}
              {f.source && <p className="mt-1 pl-6 text-xs text-muted-foreground/70">{f.source}</p>}
            </div>
          );
        })}

        {findings.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {errors.length > 0
              ? "The red ones are worth fixing before you submit — they're the reasons a release comes back."
              : "Nothing here blocks a release. They're the things a store is most likely to change for you."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
