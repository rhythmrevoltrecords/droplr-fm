/**
 * Closing an account — the parts with no database in them.
 *
 * Split from `account-close-server.ts` for one reason, learned the hard way: the confirmation form
 * is a client component, and a `"use client"` file that imports anything reaching `lib/db` drags the
 * Postgres driver into the browser bundle. Webpack then fails on `fs`, `dns`, `net` and `tls`, and
 * **`tsc --noEmit` says nothing**, because it is a bundling boundary rather than a type error. It
 * cost a deploy. Same convention as `contest.ts` / `contest-server.ts`.
 */

/** Typed confirmation. Compared loosely so a trailing space or a capital doesn't read as a refusal. */
export const closeConfirmationMatches = (typed: string, accountName: string) =>
  typed.trim().toLowerCase() === accountName.trim().toLowerCase() && accountName.trim().length > 0;

export type CloseSummary = {
  releases: number;
  fans: number;
  artists: number;
  links: number;
  customDomain: string | null;
  subscription: boolean;
};
