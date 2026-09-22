import { Card } from "@/components/ui/card";

/**
 * What a page looks like while the server is still thinking.
 *
 * Next's App Router keeps the OLD page on screen until a dynamic route's server component
 * resolves. With no loading.tsx that means a click does nothing visible for however long the
 * queries take — on production, with Neon round-trips and a cold function, easily a second.
 * Nothing is broken, but it reads as broken, which is worse.
 *
 * Deliberately plain grey blocks rather than a spinner: a skeleton in roughly the shape of the
 * page tells you the click registered AND where the content will land, so the eye is already in
 * the right place when it arrives.
 */
export function PageSkeleton({ rows = 4, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="space-y-6" aria-busy role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {header && (
        <div className="space-y-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-4 w-72" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex gap-4">
              <Bar className="h-16 w-16 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <Bar className="h-4 w-1/3" />
                <Bar className="h-3 w-1/2" />
                <Bar className="h-3 w-1/4" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Just the stats block, for streaming the slow half of a page that has already painted. */
export function StatsSkeleton() {
  return (
    <div className="space-y-4" aria-busy role="status" aria-label="Loading analytics">
      <span className="sr-only">Loading analytics…</span>
      <Bar className="h-6 w-40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Bar className="h-4 w-20" /><Bar className="mt-3 h-7 w-16" /></Card>)}
      </div>
      <Card className="p-4"><Bar className="h-40 w-full" /></Card>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-muted ${className}`} />;
}
