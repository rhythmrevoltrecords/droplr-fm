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
