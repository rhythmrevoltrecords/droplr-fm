import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSoundCloudCreds, soundcloudAuthorizeUrl, soundcloudRedirectUri } from "@/lib/soundcloud";
import { packState, releasePageUrl, requestOrigin, safeReturnUrl, withParam } from "@/lib/oauth";
import { SITE_URL } from "@/lib/env";
import { ANON_COOKIE } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Start the SoundCloud step: send the fan to authorise, carrying which gate step they're on.
 *
 * State is the existing encrypted, self-expiring blob — no server-side state table, and it can't
 * be edited by the fan, which matters because what comes back decides whether a "performed"
 * step gets marked done.
 */
export async function GET(req: NextRequest) {
  const stepId = req.nextUrl.searchParams.get("step") ?? "";
  const step = await prisma.gateStep.findUnique({
    where: { id: stepId },
    include: { release: { include: { organization: true } } },
  });
  if (!step || step.platform !== "soundcloud" || step.release.kind !== "download" || !step.release.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const back = await safeReturnUrl(
    releasePageUrl(req, step.release.organization, step.release.slug),
    `${SITE_URL}/${step.release.organization.slug}/${step.release.slug}`,
  );

  const creds = await getSoundCloudCreds(step.release.organizationId);
  // No key connected and no platform fallback: say so instead of bouncing them to a broken
  // SoundCloud error page. The gate page also hides the step in this state.
  if (!creds) return NextResponse.redirect(withParam(back, "notice", "soundcloud-unavailable"), 302);

  const { host } = requestOrigin(req);
  const state = packState({
    rid: step.release.id,
    org: step.release.organizationId,
    vid: step.id,
    anon: req.cookies.get(ANON_COOKIE)?.value ?? undefined,
    ret: back,
    ru: host,
  });
  return NextResponse.redirect(soundcloudAuthorizeUrl(creds, soundcloudRedirectUri(), state), 302);
}
