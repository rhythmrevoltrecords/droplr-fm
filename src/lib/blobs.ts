import { randomToken } from "./crypto";
import { SITE_URL } from "./env";

const STORE = "covers";

/** The only types we ever store or serve. Anything else (SVG, HTML…) could run script on our origin. */
export const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type CoverType = (typeof COVER_TYPES)[number];
export const COVER_TYPE_ERROR = "Cover must be a JPG, PNG or WebP image";

/** Detect the real image type from magic bytes. The browser-supplied file.type is attacker-controlled. */
export function sniffImage(buf: Buffer): { type: CoverType; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/**
 * Store an already-validated, already-processed image (see processUpload) in Netlify Blobs.
 * Under plain `next dev` (no Netlify context) falls back to public/uploads.
 */
export async function storeImage(buf: Buffer, type: CoverType, ext: string): Promise<string> {
  const key = `${Date.now()}-${randomToken(8)}.${ext}`;
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE);
    // new Uint8Array(buf) copies into a plain ArrayBuffer: Node's Buffer is backed by
    // ArrayBufferLike, which TypeScript 5.9+ no longer accepts as a BlobPart.
    await store.set(key, new Blob([new Uint8Array(buf)], { type }), { metadata: { contentType: type } });
    return `${SITE_URL}/api/cover/${key}`;
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, key), buf);
    return `${SITE_URL}/uploads/${key}`;
  }
}

export async function readCover(key: string) {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore(STORE);
  const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!res) return null;
  return { data: res.data, contentType: String(res.metadata?.contentType ?? "image/jpeg") };
}

/** Remove stored images by key. Best-effort: a missing key or no Blobs context is not an error. */
export async function deleteStoredImages(keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE);
    for (const key of keys) await store.delete(key).catch(() => {});
  } catch {
    // Plain `next dev` with no Netlify context: the images are files under public/uploads.
  }
  // /api/cover answers are cached at Netlify's edge for a year, tagged per key (coverCacheTag).
  // Deleting the blob alone would leave the edge copy serving. Copies already in a visitor's own
  // browser are out of anyone's reach, and the privacy wording says so.
  // No env gate: purgeCache skips itself under `netlify dev` and throws without a site id off
  // Netlify, which the catch absorbs.
  try {
    const { purgeCache } = await import("@netlify/functions");
    for (let i = 0; i < keys.length; i += 50) await purgeCache({ tags: keys.slice(i, i + 50).map(coverCacheTag) });
  } catch (e) {
    console.error("[blobs] cache purge", e instanceof Error ? e.message : e);
  }
}

/** The edge-cache tag for one stored image, set on /api/cover responses so a delete can purge it. */
export const coverCacheTag = (key: string) => `cover-${key}`;
