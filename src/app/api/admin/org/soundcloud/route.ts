import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { clientCredentialsToken, parseSoundCloudUrl, resolveId } from "@/lib/soundcloud";

const schema = z.object({
  clientId: z.string().min(8).max(200),
  clientSecret: z.string().min(8).max(200),
  /** The profile gates will follow. Resolved to a numeric id so a rename can't break them. */
  profileUrl: z.string().max(300).optional(),
});

/**
 * Connect a BYO SoundCloud app.
 *
 * Self-serve SoundCloud API keys need an Artist Pro subscription on the artist's own SoundCloud
 * account — without one, registration is a form with a review measured in weeks. That's a real
 * dead end for some artists, so the credentials are verified against SoundCloud here rather
 * than accepted on trust: better to fail in settings than on a fan's screen.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: "Confirm your email address first." }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the client ID and secret." }, { status: 400 });
  const { clientId, clientSecret, profileUrl } = parsed.data;

  const token = await clientCredentialsToken({ clientId, clientSecret, source: "byo" });
  if (!token) return NextResponse.json({ error: "SoundCloud rejected those credentials. Check them in soundcloud.com/you/apps." }, { status: 400 });

  let soundcloudUserId: string | null = null;
  let soundcloudUsername: string | null = null;
  if (profileUrl?.trim()) {
    const parsedUrl = parseSoundCloudUrl(profileUrl);
    if (!parsedUrl || parsedUrl.isTrack) return NextResponse.json({ error: "That should be your profile link, e.g. https://soundcloud.com/you" }, { status: 400 });
    const resolved = await resolveId(token, parsedUrl.url);
    if (!resolved) return NextResponse.json({ error: "SoundCloud didn't recognise that profile." }, { status: 400 });
    soundcloudUserId = String(resolved.id);
    soundcloudUsername = resolved.username ?? null;
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      soundcloudClientIdEncrypted: encrypt(clientId),
      soundcloudClientSecretEncrypted: encrypt(clientSecret),
      soundcloudAppStatus: "active",
      soundcloudUserId,
      soundcloudUsername,
    },
  });
  return NextResponse.json({ ok: true, username: soundcloudUsername });
}

export async function DELETE() {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      soundcloudClientIdEncrypted: null,
      soundcloudClientSecretEncrypted: null,
      soundcloudAppStatus: "none",
      soundcloudUserId: null,
      soundcloudUsername: null,
    },
  });
  return NextResponse.json({ ok: true });
}
