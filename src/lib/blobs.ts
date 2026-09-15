import { randomToken } from "./crypto";
import { SITE_URL } from "./env";

const STORE = "covers";

/** Upload cover to Netlify Blobs. Under plain `next dev` (no Netlify context) falls back to public/uploads. */
export async function uploadCover(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Cover must be an image");
  if (file.size > 8 * 1024 * 1024) throw new Error("Cover must be under 8MB");
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
  const key = `${Date.now()}-${randomToken(8)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE);
    await store.set(key, new Blob([buf], { type: file.type }), { metadata: { contentType: file.type } });
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
