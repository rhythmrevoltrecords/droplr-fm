import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { UNVERIFIED_ERROR } from "@/lib/email-verification";
import { planOf } from "@/lib/plans";
import { clientCredentialsToken } from "@/lib/spotify";

/** Save BYO Spotify app credentials (encrypted). Verifies them with a client-credentials call. */
export async function POST(req: NextRequest) {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Only the label owner can connect Spotify" }, { status: 401 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: UNVERIFIED_ERROR }, { status: 403 });
  if (!planOf(user.organization.plan).byoSpotify) return NextResponse.json({ error: "Your own Spotify app is on Artist Pro and the label plans" }, { status: 402 });
  const { clientId, clientSecret } = (await req.json()) as { clientId?: string; clientSecret?: string };
  if (!clientId || !/^[a-f0-9]{32}$/i.test(clientId.trim()) || !clientSecret || !/^[a-f0-9]{32}$/i.test(clientSecret.trim())) {
    return NextResponse.json({ error: "Client ID and Secret are 32-character hex strings from developer.spotify.com/dashboard" }, { status: 400 });
  }
  const token = await clientCredentialsToken({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      spotifyClientIdEncrypted: encrypt(clientId.trim()),
      spotifyClientSecretEncrypted: encrypt(clientSecret.trim()),
      spotifyAppStatus: token ? "active" : "pending",
    },
  });
  return NextResponse.json({ status: token ? "active" : "pending", message: token ? "Credentials verified with Spotify." : "Saved, but Spotify rejected a test token request. Check the secret." });
}

/** PATCH { publicButton: boolean }: show "Pre-save on Spotify" to every visitor, or only on ?spotify=1 links. */
export async function PATCH(req: NextRequest) {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Only the label owner can change this" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { publicButton?: unknown };
  if (typeof body.publicButton !== "boolean") return NextResponse.json({ error: "publicButton must be true or false" }, { status: 400 });
  await prisma.organization.update({ where: { id: user.organizationId }, data: { spotifyPublicButton: body.publicButton } });
  return NextResponse.json({ ok: true, message: body.publicButton ? "Spotify button shown to everyone" : "Spotify button only on ?spotify=1 links" });
}

export async function DELETE() {
  const user = await apiUser("label");
  if (!user || user.role !== "owner") return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { spotifyClientIdEncrypted: null, spotifyClientSecretEncrypted: null, spotifyAppStatus: "none" },
  });
  return NextResponse.json({ ok: true });
}
