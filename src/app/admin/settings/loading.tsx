import { PageSkeleton } from "@/components/admin/page-skeleton";

/** Safe here: nothing below this segment calls notFound(), so nothing needs a hard 404. */
export default function Loading() {
  return <PageSkeleton rows={4} />;
}
