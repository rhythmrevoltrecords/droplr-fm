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

/** Upload cover to Netlify Blobs. Under plain `next dev` (no Netlify context) falls back to public/uploads. */
export async function uploadCover(file: File): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Cover must be under 8MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new Error(COVER_TYPE_ERROR);
  const key = `${Date.now()}-${randomToken(8)}.${kind.ext}`;
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE);
    await store.set(key, new Blob([buf], { type: kind.type }), { metadata: { contentType: kind.type } });
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
