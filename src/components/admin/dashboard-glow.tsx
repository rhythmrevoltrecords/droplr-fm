import { cn } from "@/lib/utils";

const VIOLET = "#8B5CF6";

/** Soft accent-colour gradient behind dashboards. Intensity is tuned per theme in globals.css (.app-glow). */
export function DashboardGlow({ accent, className }: { accent: string | null | undefined; className?: string }) {
  const color = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : VIOLET;
  return <div aria-hidden className={cn("app-glow pointer-events-none inset-0 -z-10", className ?? "fixed")} style={{ ["--glow" as string]: color }} />;
}
