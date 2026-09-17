import { z } from "zod";
import { ARTIST_BIO_MAX, ARTIST_STATUSES, PRESS_PHOTOS_MAX, SOCIAL_KEYS, type SocialKey } from "./artist-fields";
import { prisma } from "./db";
import { SITE_URL } from "./env";
import { planOf } from "./plans";

// ---------- limits + access ----------

/** Profiles plus pending generic artist invites (accepting one creates a profile). Profile invites are already counted. */
export async function artistSeatsUsed(organizationId: string) {
  const [profiles, pending] = await Promise.all([
    prisma.artist.count({ where: { organizationId } }),
    prisma.invite.count({ where: { organizationId, role: "artist", artistProfileId: null, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return { profiles, pending, used: profiles + pending };
}

export async function artistLimitReached(organizationId: string, plan: string) {
  const limit = planOf(plan).artists;
  if (!Number.isFinite(limit)) return false;
  return (await artistSeatsUsed(organizationId)).used >= limit;
}

export function artistLimitMessage(plan: string) {
  const p = planOf(plan);
  return `${p.name} plan includes ${p.artists} artist${p.artists === 1 ? "" : "s"}. Upgrade for more.`;
}

/**
 * Release.artistId (what an artist login can see) is derived from the profile's login.
 * Call after a profile gains or loses a login so every existing access check keeps working unchanged.
 */
export async function syncReleaseAccess(artistProfileId: string) {
  const artist = await prisma.artist.findUnique({ where: { id: artistProfileId }, select: { organizationId: true, userId: true } });
  if (!artist) return;
  await prisma.release.updateMany({ where: { artistProfileId, organizationId: artist.organizationId }, data: { artistId: artist.userId } });
}

/** A profile in the user's organization, or null (callers answer 404 so ids from other labels look nonexistent). */
export function labelArtist(user: { organizationId: string }, id: string) {
  return prisma.artist.findFirst({ where: { id, organizationId: user.organizationId } });
}

/**
 * Release assignment input → the columns to write. artistProfileId wins; legacy artistId (a User id) maps to that
 * login's profile when it has one. Returns data: undefined when neither field was sent.
 */
export async function resolveReleaseArtist(organizationId: string, input: { artistProfileId?: string | null; artistId?: string | null }) {
  if (input.artistProfileId !== undefined) {
    if (!input.artistProfileId) return { ok: true as const, data: { artistProfileId: null, artistId: null } };
    const a = await prisma.artist.findFirst({ where: { id: input.artistProfileId, organizationId }, select: { id: true, userId: true } });
    if (!a) return { ok: false as const, error: "Artist not in your roster" };
    return { ok: true as const, data: { artistProfileId: a.id, artistId: a.userId } };
  }
  if (input.artistId !== undefined) {
    if (!input.artistId) return { ok: true as const, data: { artistProfileId: null, artistId: null } };
    const u = await prisma.user.findFirst({ where: { id: input.artistId, organizationId }, select: { id: true, artistProfile: { select: { id: true } } } });
    if (!u) return { ok: false as const, error: "Artist not in your roster" };
    return { ok: true as const, data: { artistProfileId: u.artistProfile?.id ?? null, artistId: u.id } };
  }
  return { ok: true as const, data: undefined };
}

// ---------- validation ----------

/** Artist ID from a Spotify artist link, spotify:artist: URI or bare 22-character ID. Album/track links are rejected. */
export function spotifyArtistIdFrom(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;
  const m = s.match(/^spotify:artist:([A-Za-z0-9]{22})$/) ?? s.match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i);
  return m ? m[1] : null;
}

const blank = (v: string | null | undefined) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null);
const text = (max: number, msg?: string) => z.string().max(max, msg).nullable().optional().transform(blank);

function isHttpsUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
  } catch {
    return false;
  }
}
const httpsUrl = z.string().trim().max(500).refine(isHttpsUrl, "Links must be full https:// URLs");

/**
 * Photos must be files we host (uploaded via upload-cover / upload-photo): no hotlinking, and nothing
 * that makes a browser or our image code fetch an arbitrary host.
 */
export function isHostedPhotoUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.origin !== new URL(SITE_URL).origin || u.search || u.hash || u.username || u.password) return false;
  if (/^\/api\/cover\/[\w.-]+$/.test(u.pathname)) return true;
  // uploadCover's local fallback under plain `next dev` (never used in production).
  return process.env.NODE_ENV !== "production" && /^\/uploads\/[\w.-]+$/.test(u.pathname);
}
const hostedPhoto = z.string().trim().max(500).refine(isHostedPhotoUrl, "Photos must be uploaded here (JPG, PNG or WebP)");

const socialShape = Object.fromEntries(SOCIAL_KEYS.map((k) => [k, httpsUrl.or(z.literal("")).nullable().optional()])) as Record<SocialKey, z.ZodOptional<z.ZodNullable<z.ZodUnion<[typeof httpsUrl, z.ZodLiteral<"">]>>>>;
/** Unknown keys are dropped, empty values removed; {} is stored as null. */
const socialLinks = z
  .object(socialShape)
  .nullable()
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const out: Partial<Record<SocialKey, string>> = {};
    for (const k of SOCIAL_KEYS) if (v?.[k]) out[k] = v[k]!;
    return Object.keys(out).length ? out : null;
  });

const count = z.number().int().min(0).max(2_000_000_000).nullable().optional();

// Fields the artist may edit about themselves. Anything else in the body is stripped by zod.
const selfShape = {
  bio: text(ARTIST_BIO_MAX, `Bio must be ${ARTIST_BIO_MAX} characters or less`),
  genre: text(60),
  location: text(120),
  website: httpsUrl.or(z.literal("")).nullable().optional().transform(blank),
  socialLinks,
  photoUrl: hostedPhoto.or(z.literal("")).nullable().optional().transform(blank),
  pressPhotoUrls: z.array(hostedPhoto).max(PRESS_PHOTOS_MAX, `Up to ${PRESS_PHOTOS_MAX} press photos`).optional(),
  // Comes back from the photo upload; only a colour, so harmless to accept from the artist too.
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal("")).nullable().optional().transform(blank),
};

export const artistSelfInput = z.object(selfShape);

const labelShape = {
  ...selfShape,
  name: z.string().trim().min(1, "Name is required").max(120),
  status: z.enum(ARTIST_STATUSES).optional(),
  email: z.string().trim().max(200).email("Enter a valid email").or(z.literal("")).nullable().optional().transform((v) => (v === undefined ? undefined : v ? v.toLowerCase() : null)),
  phone: text(40),
  notes: text(5000),
  signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Signed date should be YYYY-MM-DD").or(z.literal("")).nullable().optional()
    .transform((v) => (v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null)),
  // Accepts the artist's Spotify link (open.spotify.com/artist/…, with or without ?si=), a spotify:artist: URI, or the bare ID; stores the ID.
  spotifyArtistId: z
    .string()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const s = (v ?? "").trim();
      if (!s) return null;
      const id = spotifyArtistIdFrom(s);
      if (!id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Paste the artist's Spotify link (open.spotify.com/artist/…) or their 22-character artist ID" });
        return z.NEVER;
      }
      return id;
    }),
  monthlyListeners: count,
  followers: count,
};

/** Create: name required. */
export const artistCreateInput = z.object(labelShape);
/** Label edit: everything optional; only sent fields change. */
export const artistInput = z.object({ ...labelShape, name: labelShape.name.optional() });

/** Readable messages. For "x or blank" unions, zod's top message is just "Invalid input": use the real one inside. */
export const zodError = (e: z.ZodError) =>
  e.issues
    .map((i) => (i.code === "invalid_union" ? i.unionErrors[0]?.issues[0]?.message ?? i.message : i.message))
    .join("; ");

/** Drop undefined so Prisma leaves those columns alone. */
export function definedOnly<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
