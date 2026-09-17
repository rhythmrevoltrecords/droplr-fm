import { COVER_TYPE_ERROR, sniffImage } from "./blobs";

export const IMAGE_PURPOSES = ["cover", "avatar", "logo", "press"] as const;
export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];
export const IMAGE_READ_ERROR = "We couldn't read that image. Export it as JPG or PNG and try again.";
export const IMAGE_PIXELS_ERROR = "Image is too large. Use one under 60 megapixels.";
/** Netlify rejects request bodies over ~6MB before our code runs; the client crop keeps uploads far below this. */
export const UPLOAD_MAX_BYTES = 4.5 * 1024 * 1024;
export const UPLOAD_TOO_BIG = "Image must be under 4.5MB";
/** Messages processUpload and the upload routes return on purpose (400); anything else is internal. */
export const IMAGE_VALIDATION_ERRORS = [IMAGE_READ_ERROR, IMAGE_PIXELS_ERROR, UPLOAD_TOO_BIG] as const;

/** Longest edge we keep per use. Covers/avatars render at ~600px CSS on 2x-3x screens; press photos get downloaded. */
const MAX_EDGE: Record<ImagePurpose, number> = { cover: 1600, avatar: 1600, logo: 1200, press: 2400 };

export function isImagePurpose(v: unknown): v is ImagePurpose {
  return typeof v === "string" && (IMAGE_PURPOSES as readonly string[]).includes(v);
}

/**
 * Normalise an upload: auto-orient, downscale, re-encode as WebP. Runs even when the client already cropped,
 * because the API can be called directly with any bytes.
 */
export async function processUpload(buf: Buffer, purpose: ImagePurpose): Promise<{ buffer: Buffer; type: "image/webp"; ext: "webp"; width: number; height: number }> {
  // Sniff before decoding: don't hand arbitrary bytes (SVG, HTML…) to the image decoder.
  if (!sniffImage(buf)) throw new Error(COVER_TYPE_ERROR);
  const { default: sharp } = await import("sharp");
  const max = MAX_EDGE[purpose];
  try {
    // limitInputPixels guards against decompression bombs; failOn "error" rejects truncated/corrupt files.
    const { data, info } = await sharp(buf, { limitInputPixels: 60_000_000, failOn: "error" })
      .rotate() // bake in EXIF orientation before the metadata is dropped
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      // No withMetadata(): sharp strips EXIF/GPS/XMP by default, which is what we want for privacy
      // (phone photos carry the location they were taken at).
      .webp({ quality: 82, alphaQuality: 90, effort: 4 })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, type: "image/webp", ext: "webp", width: info.width, height: info.height };
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    console.warn("[processUpload]", msg);
    if (/pixel limit/i.test(msg)) throw new Error(IMAGE_PIXELS_ERROR);
    throw new Error(IMAGE_READ_ERROR);
  }
}
