/**
 * What a download gate can and can't prove, as plain data.
 *
 * Separate from lib/downloads.ts because the gate builder is a client component: importing the
 * database module into it drags Prisma and `pg` into the browser bundle, which fails the build
 * with "Can't resolve 'fs'". Everything here is constants and pure functions, safe on both sides.
 */
/** email | soundcloud | instagram | tiktok | youtube | spotify | facebook | link */
export type GatePlatform =
  | "email" | "soundcloud" | "instagram" | "tiktok" | "youtube" | "spotify" | "facebook" | "link";
export type GateAction = "email" | "follow" | "like" | "repost" | "visit";

/**
 * How a step's completion is established. This is a property of the platform, never of the row,
 * so it can't drift per-gate or be talked up in the UI.
 *
 *  - "performed": the fan authorises droplr, droplr carries out the action with their own token
 *    and gets a success back. The strongest of the three — the action definitely happened,
 *    because droplr did it.
 *  - "given": the fan handed something over that droplr now holds. Email.
 *  - "unverified": droplr opens a link and takes their word for it. No API from Instagram,
 *    TikTok, YouTube or Spotify exposes whether a given visitor follows a given account, so
 *    nobody's gate verifies these — whatever their marketing implies.
 */
export type Proof = "performed" | "given" | "unverified";

type PlatformSpec = {
  label: string;
  actions: GateAction[];
  proof: Proof;
  /** Shown to the artist in the builder. Plain language, no hedging. */
  note: string;
  needsTarget: boolean;
};

export const GATE_PLATFORMS: Record<GatePlatform, PlatformSpec> = {
  email: {
    label: "Email address",
    actions: ["email"],
    proof: "given",
    note: "They give you the address and it joins your fan list. The only step that grows something you keep.",
    needsTarget: false,
  },
  soundcloud: {
    label: "SoundCloud",
    actions: ["follow", "like", "repost"],
    proof: "performed",
    note: "They connect SoundCloud once and droplr performs the follow, like or repost for them. Genuinely done, not assumed.",
    needsTarget: true,
  },
  instagram: {
    label: "Instagram",
    actions: ["follow", "visit"],
    proof: "unverified",
    note: "Opens your profile. Instagram gives no app any way to check whether someone followed, so this is on trust.",
    needsTarget: true,
  },
  tiktok: {
    label: "TikTok",
    actions: ["follow", "visit"],
    proof: "unverified",
    note: "Opens your profile. TikTok exposes no follow check to anyone, so this is on trust.",
    needsTarget: true,
  },
  youtube: {
    label: "YouTube",
    actions: ["follow", "visit"],
    proof: "unverified",
    note: "Opens your channel. Subscriptions can't be checked for a visitor, so this is on trust.",
    needsTarget: true,
  },
  spotify: {
    label: "Spotify",
    actions: ["follow", "visit"],
    proof: "unverified",
    note: "Opens your artist page. droplr will not ask for Spotify permissions to inflate a follower count.",
    needsTarget: true,
  },
  facebook: {
    label: "Facebook",
    actions: ["follow", "visit"],
    proof: "unverified",
    note: "Opens your page. No follow check exists, so this is on trust.",
    needsTarget: true,
  },
  link: {
    label: "Visit a link",
    actions: ["visit"],
    proof: "unverified",
    note: "Sends them anywhere — a merch page, a mailing list, a video. On trust.",
    needsTarget: true,
  },
};

export const isGatePlatform = (v: string): v is GatePlatform => v in GATE_PLATFORMS;
export const proofOf = (platform: string): Proof =>
  isGatePlatform(platform) ? GATE_PLATFORMS[platform].proof : "unverified";
export const isProvable = (platform: string) => proofOf(platform) !== "unverified";

/**
 * Whether a "performed" platform can still actually perform, right now.
 *
 * On 10 June 2026 SoundCloud paused Hypeddit's API connection and every enforced download gate in
 * that scene became voluntary overnight. SoundCloud's own staff said they had not blocked such
 * services in general, so this is a risk rather than a prohibition — but their API Terms bar using
 * the API to "add followers, like sounds or make comments on behalf of a user, unless those actions
 * are specifically and deliberately initiated by the user", which is the clause droplr's performed
 * step sits under.
 *
 * So enforcement is a runtime state, not a fact about the platform:
 *
 *  - "enforced"    — today. droplr performs the action and the step is only done if it succeeded.
 *  - "voluntary"   — the step is still asked for and still opens SoundCloud, but it completes on
 *    the click, like any unverified step, and says so. This is the state Hypeddit landed in.
 *  - "unavailable" — the step is dropped from the gate entirely.
 *
 * A live campaign has to survive the transition without the label touching it, which is why this is
 * resolved at render time rather than written onto the GateStep row. A label that sold a follow for
 * a download three weeks ago cannot be asked to go and edit six gates the morning an API goes away.
 */
export type Enforcement = "enforced" | "voluntary" | "unavailable";

export const ENFORCEMENTS: readonly Enforcement[] = ["enforced", "voluntary", "unavailable"];
export const isEnforcement = (v: string | null | undefined): v is Enforcement =>
  !!v && (ENFORCEMENTS as readonly string[]).includes(v);

/**
 * The proof a step can actually offer, given the current enforcement state.
 *
 * Only affects platforms that claim "performed" — a degraded state cannot make an unverified step
 * more trustworthy, and "given" (email) does not depend on anyone else's API. Degrading always
 * lands on "unverified", never on "given": the fan clicked, and a click is all there is.
 */
export function effectiveProof(platform: string, enforcement: Enforcement): Proof {
  const declared = proofOf(platform);
  if (declared !== "performed") return declared;
  return enforcement === "enforced" ? "performed" : "unverified";
}

/** True when this platform's step is performed on the fan's behalf right now. */
export const isPerforming = (platform: string, enforcement: Enforcement) =>
  effectiveProof(platform, enforcement) === "performed";

/** True when the step should not be shown at all. */
export const isDropped = (platform: string, enforcement: Enforcement) =>
  proofOf(platform) === "performed" && enforcement === "unavailable";

/**
 * What to tell the artist in the gate builder when a platform is degraded. Returns null when
 * nothing is wrong, so the builder shows no reassuring noise in the normal case.
 */
export function enforcementNote(platform: string, enforcement: Enforcement): string | null {
  if (proofOf(platform) !== "performed" || enforcement === "enforced") return null;
  const label = isGatePlatform(platform) ? GATE_PLATFORMS[platform].label : platform;
  return enforcement === "voluntary"
    ? `${label} has paused the connection droplr used to carry this out, so right now this step opens ${label} and completes on the click. Your fans still see it and your gate still works — it just isn't checked, and the page says so.`
    : `${label} steps are switched off right now, so droplr has left this one out of the gate rather than showing your fans a step they can't finish.`;
}

/** What the fan is told a step will do, before they do it. */
export function stepLabel(platform: string, action: string, orgName: string): string {
  const name = isGatePlatform(platform) ? GATE_PLATFORMS[platform].label : platform;
  if (platform === "email") return "Enter your email address";
  switch (action) {
    case "follow": return `Follow ${orgName} on ${name}`;
    case "like": return `Like the track on ${name}`;
    case "repost": return `Repost the track on ${name}`;
    default: return `Open ${name}`;
  }
}
