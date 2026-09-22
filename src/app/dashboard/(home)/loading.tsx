import { PageSkeleton } from "@/components/admin/page-skeleton";

/** Scoped to /dashboard alone — see the note in admin/(home)/loading.tsx. */
export default function Loading() {
  return <PageSkeleton rows={3} />;
}
