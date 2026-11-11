/**
 * What a download gate still needs before it can be created, in the words the form itself uses.
 *
 * Same fix as the bio form (`bio-form-check.ts`), for the same reason: on 12 Nov the Downloads → New
 * button sat grey until artwork was uploaded and nothing on the page said so, next to placeholders
 * that read as filled-in answers. The button and the sentence beside it follow this one rule, so
 * they can't drift apart. The server still requires all three (`api/admin/downloads/route.ts`).
 */

export type DownloadFormField = "name" | "artwork" | "link to the files";

export function missingDownloadFields(v: { title: string; downloadUrl: string; coverUrl: string }): DownloadFormField[] {
  const out: DownloadFormField[] = [];
  if (!v.title.trim()) out.push("name");
  if (!v.coverUrl.trim()) out.push("artwork");
  if (!v.downloadUrl.trim()) out.push("link to the files");
  return out;
}

/** "Still needs artwork." / "Still needs a name and artwork." / "" when nothing is missing. */
export function missingDownloadLine(fields: readonly DownloadFormField[]): string {
  if (fields.length === 0) return "";
  const named = fields.map((f) => (f === "artwork" ? "artwork" : `a ${f}`));
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Still needs ${list}.`;
}
