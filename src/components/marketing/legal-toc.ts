import type { TocItem } from "./legal-shell";

/** Keeps section numbers and the table of contents in sync. */
export function tocHelper(toc: TocItem[]) {
  return (id: string) => {
    const i = toc.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`Unknown legal section: ${id}`);
    return { id, n: i + 1, title: toc[i].title };
  };
}
