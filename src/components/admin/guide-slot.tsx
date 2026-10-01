import { getCurrentUser } from "@/lib/auth";
import { liveGuide, type GuideKey } from "@/lib/guides";
import { GuideCard } from "@/components/admin/guide-card";

/**
 * Drops one guide card onto a page, or nothing at all.
 *
 * A server component on purpose. The clock is read here, per request, which is what makes a card
 * appear at 9am without a deploy — `liveGuide` refuses to default `now` precisely so this can't be
 * done at module scope by accident. Every admin page reads the session cookie, so every page that
 * renders this is already dynamic; nothing extra is needed to opt out of static rendering.
 *
 * Renders nothing when the video isn't out yet, when its ID is blank, or when this login has
 * already closed that card — so a caller is one line and never has to think about any of it.
 */
export async function GuideSlot({ guide, className }: { guide: GuideKey; className?: string }) {
  const g = liveGuide(guide, new Date());
  if (!g) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return <GuideCard guide={g} dismissed={user.guidesDismissed.includes(guide)} className={className} />;
}
