import { apiUser } from "./auth";
import { prisma } from "./db";

/** Label user + a release that belongs to their org. */
export async function labelRelease(releaseId: string) {
  const user = await apiUser("label");
  if (!user) return { error: "Unauthorised", status: 401 as const };
  const release = await prisma.release.findFirst({ where: { id: releaseId, organizationId: user.organizationId } });
  if (!release) return { error: "Not found", status: 404 as const };
  return { user, release };
}

/** Label user + a roster profile in their org. ownerOnly checks the role after the 404, so other labels learn nothing. */
export async function labelArtistProfile(artistId: string, opts: { ownerOnly?: boolean } = {}) {
  const user = await apiUser("label");
  if (!user) return { error: "Unauthorised", status: 401 as const };
  const artist = await prisma.artist.findFirst({ where: { id: artistId, organizationId: user.organizationId } });
  if (!artist) return { error: "Not found", status: 404 as const };
  if (opts.ownerOnly && user.role !== "owner") return { error: "Only the label owner can do this", status: 403 as const };
  return { user, artist };
}
