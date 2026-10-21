/**
 * What a bio page still needs before it can be saved, in the words the form itself uses.
 *
 * Pure and separate from the form so the rule the button follows and the sentence beside it come
 * from one place. The 21 Oct walkthrough found the button disabled with nothing saying why, next to
 * three fields whose placeholders were the artist's own name, so the form looked finished and did
 * nothing. Same three conditions the button always had; the difference is that they are now said.
 */

export type BioFormField = "name" | "page address" | "image";

export function missingFields(v: { title: string; slug: string; imageUrl: string }): BioFormField[] {
  const out: BioFormField[] = [];
  if (!v.title.trim()) out.push("name");
  if (!v.slug.trim()) out.push("page address");
  if (!v.imageUrl.trim()) out.push("image");
  return out;
}

/** "Still needs an image." / "Still needs a name and an image." / "" when nothing is missing. */
export function missingLine(fields: readonly BioFormField[]): string {
  if (fields.length === 0) return "";
  const named = fields.map((f) => (f === "image" ? "an image" : `a ${f}`));
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Still needs ${list}.`;
}
