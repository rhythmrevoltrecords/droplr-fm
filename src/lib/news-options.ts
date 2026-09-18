import { prisma } from "./db";
import { fanSummary } from "./fans";
import { countryName } from "./analytics";
import { platformMeta } from "./platforms";

/** The country / store / release dropdowns on the fan-email composer. */
export async function newsOptions(orgId: string) {
  const [summary, releases] = await Promise.all([
    fanSummary(orgId),
    prisma.release.findMany({ where: { organizationId: orgId }, orderBy: { releaseDate: "desc" }, take: 100, select: { id: true, title: true, artistName: true } }),
  ]);
  return {
    countries: summary.countries.map((c) => ({ value: c.value, label: `${countryName(c.value)} (${c.fans})` })),
    stores: summary.stores.map((s) => ({ value: s.value, label: `${platformMeta(s.value).name} (${s.fans})` })),
    releases: releases.map((r) => ({ value: r.id, label: `${r.title} — ${r.artistName}` })),
  };
}
