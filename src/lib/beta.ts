/**
 * Features merged but not yet open to everyone. Each is off for every account until the platform
 * owner switches it on for that account in /platform. Pure: safe in client components.
 *
 * Off means the feature doesn't exist for the account — no nav item, its pages 404, its routes
 * 404, no reminders, and links it emailed stop working. Nothing it made is deleted, and its CSV
 * exports keep working, because leaving isn't a funnel. Plan gates still apply when it's on.
 *
 * To open one to everyone: delete it from this list and from every hasBeta() call, and put it
 * back on the roadmap and the pricing copy (test:plancopy refuses to advertise a beta).
 */
export const BETA_FEATURES = [
  { key: "agreements", label: "Agreements", hint: "Deals kept next to the roster and releases, with notice-date reminders" },
  { key: "royalties", label: "Royalties and splits", hint: "Split sheets collaborators confirm, and statements per collaborator" },
] as const;
export type BetaFeature = (typeof BETA_FEATURES)[number]["key"];
export const isBetaFeature = (f: unknown): f is BetaFeature => BETA_FEATURES.some((b) => b.key === f);

export const hasBeta = (org: { betaFeatures?: string[] | null } | null | undefined, f: BetaFeature) => !!org?.betaFeatures?.includes(f);
