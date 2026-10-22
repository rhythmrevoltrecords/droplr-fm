/**
 * Background blur, baked into the image.
 *
 * Not a CSS `filter: blur` on the page. A full-screen blur on these pages was measured as the main
 * LCP cost once and removed, because a phone re-composites it on every scroll frame. Blurring the
 * picture once when the owner saves costs a fan nothing: the page loads an ordinary (and smaller,
 * blur compresses well) image.
 *
 * The original upload is kept in backgroundSourceUrl so changing the amount re-blurs the original
 * instead of blurring an already blurred copy. backgroundUrl is always what the page shows.
 *
 * Server only: it reads from the blob store and runs sharp.
 */
import { readCover, storeImage } from "./blobs";
import { isOwnImage } from "./bio-items";
import { SITE_URL } from "./env";
import { BLUR_SIGMA, blurOf, type BlurLevel } from "./page-look";

type Stored = { backgroundUrl: string | null; backgroundSourceUrl: string | null; backgroundBlur: string | null };
export type BackgroundPatch = { backgroundUrl?: string | null; backgroundSourceUrl?: string | null; backgroundBlur?: string | null };

async function readOwnImage(url: string): Promise<Buffer | null> {
  const cover = `${SITE_URL}/api/cover/`;
  if (url.startsWith(cover)) {
    const got = await readCover(url.slice(cover.length));
    return got ? Buffer.from(got.data as ArrayBuffer) : null;
  }
  const uploads = `${SITE_URL}/uploads/`;
  if (url.startsWith(uploads) && process.env.NODE_ENV !== "production") {
    // `next dev` without Netlify: storeImage wrote it to public/uploads.
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const name = path.basename(url.slice(uploads.length));
    return readFile(path.join(process.cwd(), "public", "uploads", name)).catch(() => null);
  }
  return null;
}

export async function blurredCopy(sourceUrl: string, level: Exclude<BlurLevel, "none">): Promise<string> {
  const buf = await readOwnImage(sourceUrl);
  if (!buf) throw new Error("background not found");
  const { default: sharp } = await import("sharp");
  const out = await sharp(buf, { limitInputPixels: 60_000_000, failOn: "error" })
    .blur(BLUR_SIGMA[level])
    .webp({ quality: 70, effort: 4 })
    .timeout({ seconds: 10 })
    .toBuffer();
  return storeImage(out, "image/webp", "webp");
}

/**
 * The background columns to write, given what the form sent (the ORIGINAL image and a blur level)
 * and what is stored now. Undefined fields in the input mean "not sent": nothing is touched.
 *
 * Re-uses the stored blurred copy when neither the original nor the level changed, so pressing Save
 * again doesn't mint a new image every time.
 */
export async function backgroundPatch(
  input: { backgroundUrl?: string | null; backgroundBlur?: string | null },
  stored: Stored | null,
): Promise<{ ok: true; patch: BackgroundPatch } | { ok: false; error: string }> {
  if (input.backgroundUrl === undefined && input.backgroundBlur === undefined) return { ok: true, patch: {} };
  const original = input.backgroundUrl !== undefined ? input.backgroundUrl || null : (stored?.backgroundSourceUrl ?? stored?.backgroundUrl ?? null);
  const level = input.backgroundBlur !== undefined ? blurOf(input.backgroundBlur) : blurOf(stored?.backgroundBlur);

  if (!original) return { ok: true, patch: { backgroundUrl: null, backgroundSourceUrl: null, backgroundBlur: null } };
  // Only images droplr stored itself: an outside URL is a third party's request on every visit.
  if (!isOwnImage(original, SITE_URL)) return { ok: false, error: "Upload the background here rather than linking to it." };
  if (level === "none") return { ok: true, patch: { backgroundUrl: original, backgroundSourceUrl: null, backgroundBlur: null } };

  if (stored && stored.backgroundSourceUrl === original && stored.backgroundBlur === level && stored.backgroundUrl) {
    return { ok: true, patch: { backgroundUrl: stored.backgroundUrl, backgroundSourceUrl: original, backgroundBlur: level } };
  }
  try {
    const blurred = await blurredCopy(original, level);
    return { ok: true, patch: { backgroundUrl: blurred, backgroundSourceUrl: original, backgroundBlur: level } };
  } catch (e) {
    console.error("[background-blur]", (e as Error)?.message);
    return { ok: false, error: "Couldn't blur that image. Try uploading it again." };
  }
}
