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
