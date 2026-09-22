import { PageSkeleton } from "@/components/admin/page-skeleton";

/**
 * Scoped to /admin alone, via the (home) route group.
 *
 * A loading.tsx applies to its segment AND everything below it, and it makes the route stream:
 * the shell flushes with a 200 before the page runs, so a later notFound() can no longer set a
 * 404. The detail pages under /admin rely on that 404 — it's how one label's ids look
 * nonexistent to another — so they deliberately get no skeleton.
 */
export default function Loading() {
  return <PageSkeleton rows={4} />;
}
