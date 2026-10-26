import { prisma } from "./db";
import { dayString } from "./agreements";
import type { AgreementFormValue } from "./agreements";

/** The roster and releases a form can choose from: the account's own, nothing else. */
export async function formOptions(organizationId: string) {
  const [artists, releases] = await Promise.all([
    prisma.artist.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.release.findMany({ where: { organizationId, kind: "release" }, orderBy: { releaseDate: "desc" }, select: { id: true, title: true, artistName: true, artistProfileId: true }, take: 2000 }),
  ]);
  return {
    artists: artists.map((a) => ({ id: a.id, label: a.name })),
    releases: releases.map((r) => ({ id: r.id, label: `${r.title} · ${r.artistName}`, artistId: r.artistProfileId })),
  };
}

export function toFormValue(a: {
  title: string; kind: string; status: string; artistId: string | null; counterparty: string | null; signedOn: Date | null; startsOn: Date | null; endsOn: Date | null;
  noticeDays: number | null; documentUrl: string | null; termsNote: string | null; notes: string | null; releases: { releaseId: string }[];
}): AgreementFormValue {
  return {
    title: a.title, kind: a.kind as AgreementFormValue["kind"], status: a.status as AgreementFormValue["status"], artistId: a.artistId ?? "", counterparty: a.counterparty ?? "",
    signedOn: dayString(a.signedOn), startsOn: dayString(a.startsOn), endsOn: dayString(a.endsOn), noticeDays: a.noticeDays === null ? "" : String(a.noticeDays),
    documentUrl: a.documentUrl ?? "", termsNote: a.termsNote ?? "", notes: a.notes ?? "", releaseIds: a.releases.map((r) => r.releaseId),
  };
}
