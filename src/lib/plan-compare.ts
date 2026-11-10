import { domainsOpen } from "./launch";
import { artistsLine, clicksLine, downloadsLine, emailsLine, insightsLine, releasesLine } from "./plan-copy";
import { PLAN_LIMITS, type PlanKey } from "./plans";

/**
 * The /pricing comparison table and plan-card highlights, read from PLAN_LIMITS so a limit change
 * moves the table with it. A row is either a yes/no flag or a short value. Rows with no flag of
 * their own say where their answer comes from.
 *
 * Agreements and royalties are deliberately absent: they are betas (lib/beta) and no plan may
 * advertise them until they open to everyone.
 */

export type Cell = boolean | string;
export type CompareRow = { label: string; note?: string; cells: Cell[] };
export type CompareGroup = { title: string; rows: CompareRow[] };

export const ARTIST_PLANS: PlanKey[] = ["free", "artist", "artist_pro"];
export const LABEL_PLANS: PlanKey[] = ["free", "pro", "label", "enterprise"];

const L = PLAN_LIMITS;
const n = (v: number, unlimited: string, f: (v: number) => string) => (v === Infinity ? unlimited : f(v));
const compact = (v: number) => (v >= 1000 && v % 1000 === 0 ? `${v / 1000}k` : v.toLocaleString("en-AU"));

/** Custom domains are on the plan, but connecting one is invite-only until DOMAINS_OPEN (lib/launch). */
export const domainNote = () => (domainsOpen() ? undefined : "Invite-only for now: email hello@droplr.fm and it's switched on for your account.");

export function compareGroups(plans: PlanKey[]): CompareGroup[] {
  const row = (label: string, cell: (k: PlanKey) => Cell, note?: string): CompareRow => ({ label, note, cells: plans.map(cell) });
  // A group no plan in this set has anything in (Team & label, for the artist plans) is left out.
  const groups: CompareGroup[] = [
    {
      title: "Releases & links",
      rows: [
        row("Artists", (k) => n(L[k].artists, "Unlimited", (v) => (v === 1 ? "1" : `Up to ${v}`))),
        row("New releases", (k) => n(L[k].releases, "Unlimited", String), "In any rolling 12 months, not a calendar year."),
        row("Download gates", (k) => n(L[k].downloads, "Unlimited", String), "In any rolling 12 months."),
        row("Clicks a month", (k) => n(L[k].clicksPerMonth, "Uncapped", compact), "A soft cap: links never stop working."),
        row("Analytics history", (k) => n(L[k].insightsDays, "All time", (v) => `${v} days`)),
        row("QR codes", (k) => L[k].qr),
        row("Meta, TikTok and GA4 pixels", (k) => L[k].pixels),
      ],
    },
    {
      title: "Fans",
      rows: [
        row("Email pre-saves, in each fan's timezone", () => true),
        row("Release-day email", (k) => n(L[k].releaseEmails, "Every pre-saver", (v) => `First ${v} per release`)),
        row("Every fan address visible", () => true),
        row("CSV export with each fan's consent", (k) => L[k].csvExport),
        row("News emails to opted-in fans", (k) => L[k].newsEmails),
        row("Sync fans to Mailchimp", (k) => L[k].espSync),
        row("Remix contests with a public vote", (k) => L[k].contests),
        row("Spotify library pre-save for VIPs", (k) => L[k].byoSpotify, "Through your own Spotify app, which Spotify limits to 5 allowlisted accounts."),
      ],
    },
    {
      title: "Pages & brand",
      // Bio pages and release clips are ungated (plan-copy `common`).
      rows: [
        row("Bio link page, looks included", () => true),
        row("Release clips for Reels and TikTok", () => true),
        row("Promo plan and share graphics", () => true),
        row("Your own look on release pages", (k) => L[k].pageLooks),
        row("Custom domain", (k) => L[k].customDomain, domainNote()),
        row("No droplr.fm branding", (k) => L[k].removeBranding),
      ],
    },
    {
      title: "Team & label",
      rows: [
        // A roster of more than one is what artist logins are for (lib/artists enforces the count).
        row("Artist logins and roster profiles", (k) => L[k].artists > 1),
        row("Release plans with tasks for the label or the artist", (k) => L[k].teamPlanning),
        // Admin roles are gated on whiteLabel (api/admin/artists).
        row("Team roles (admins)", (k) => L[k].whiteLabel),
      ],
    },
  ];
  return groups.filter((g) => g.rows.some((r) => r.cells.some((c) => c !== false)));
}

/** Who a plan is for, under its name, so "Pro" (a label plan) can't be mistaken for "Artist Pro". */
export const PLAN_FOR: Record<PlanKey, string> = {
  free: `Artists and labels · ${artistsLine("free")}`,
  artist: `Artist · ${artistsLine("artist")}`,
  artist_pro: `Artist · ${artistsLine("artist_pro")}`,
  pro: `Label · ${artistsLine("pro").toLowerCase()}`,
  label: `Label · ${artistsLine("label").toLowerCase()}`,
  enterprise: "Label · distributors and big catalogues",
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Four or five lines per card; the table carries the rest. */
export function planHighlights(k: PlanKey): string[] {
  const domain = domainsOpen() ? "Custom domain" : "Custom domain (invite-only for now)";
  switch (k) {
    case "free":
      return [`${artistsLine(k)}, ${lower(releasesLine(k))}`, downloadsLine(k), emailsLine(k), "Every fan address visible", "Bio page and release clips"];
    case "artist":
      return [releasesLine(k), "Unlimited download gates and release-day emails", `${clicksLine(k)}, ${lower(insightsLine(k))}`, "CSV export, news emails, pixels, QR codes", "Your own page look, plus release clips"];
    case "artist_pro":
      return ["Everything in Artist", `${releasesLine(k)}, ${lower(clicksLine(k))}`, insightsLine(k), `${domain}, no droplr.fm branding`, "Your own Spotify app for VIP library pre-saves"];
    case "pro":
      return [artistsLine(k), "Artist logins and roster profiles", "Release plans with tasks for the label or the artist", `${domain}, no droplr.fm branding`, "Everything in Artist Pro"];
    case "label":
      return ["Everything in Pro", artistsLine(k), clicksLine(k), "Team roles (admins)"];
    case "enterprise":
      return ["Everything in Label", clicksLine(k), "Priority support and onboarding"];
  }
}
