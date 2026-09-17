"use client";
import { Loader2, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type MediaSize, type Point } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AspectPreset = { label: string; value: number | null };
export type ImagePurpose = "cover" | "avatar" | "logo" | "press";
export type UploadedImage = { url: string; accentColor: string | null; width?: number; height?: number };

export const ASPECT_SQUARE: AspectPreset = { label: "Square", value: 1 };
export const ASPECT_4_5: AspectPreset = { label: "4:5", value: 4 / 5 };
export const ASPECT_16_9: AspectPreset = { label: "16:9", value: 16 / 9 };
/** null = the image's own aspect ratio. */
export const ASPECT_ORIGINAL: AspectPreset = { label: "Original", value: null };

// HEIC/HEIF is listed because Safari can decode it; other browsers get the "can't read" message.
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
export const IMAGE_HINT = "JPG, PNG, WebP or HEIC. You can crop before uploading.";

const DECODE_ERROR = "We can't read this image. Export it as JPG or PNG and try again.";
const TOO_LARGE_413 = "That image is too large to upload. Try a smaller one.";
const UPLOAD_FAILED = "Upload failed. Try again.";
// Keeps uploads well under Netlify's ~6MB function body limit (the server allows 4.5MB).
const SOFT_MAX_BYTES = 3.5 * 1024 * 1024;
// JPEG has no alpha: fill with the app's near-black so transparent logos don't get a white box on the dark UI.
const JPEG_BACKGROUND = "#0b0b0f";

type Source = { el: CanvasImageSource; width: number; height: number };

function rotatedSize(width: number, height: number, rotation: number) {
  const rad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/** Draw the crop (in rotated-image pixels, as react-easy-crop reports it) scaled so the longest edge is ≤ maxEdge. */
function drawCrop(src: Source, area: Area, rotation: number, maxEdge: number, fill?: string) {
  const scale = Math.min(1, maxEdge / Math.max(area.width, area.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Straight from source to output in one draw: no full-size intermediate canvas (iOS caps canvas memory).
  const box = rotatedSize(src.width, src.height, rotation);
  ctx.scale(scale, scale);
  ctx.translate(-area.x, -area.y);
  ctx.translate(box.width / 2, box.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-src.width / 2, -src.height / 2);
  ctx.drawImage(src.el, 0, 0);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function exportCrop(src: Source, area: Area, rotation: number, maxEdge: number, name: string): Promise<File> {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "image";
  let canvas = drawCrop(src, area, rotation, maxEdge);
  let blob = await toBlob(canvas, "image/webp", 0.92);
  // Safari (and older browsers) silently fall back to PNG for unsupported types: re-encode as JPEG instead.
  const webp = blob?.type === "image/webp";
  if (!webp) {
    canvas.width = 0;
    canvas = drawCrop(src, area, rotation, maxEdge, JPEG_BACKGROUND);
    blob = await toBlob(canvas, "image/jpeg", 0.92);
  }
  if (blob && blob.size > SOFT_MAX_BYTES) {
    if (webp) {
      canvas.width = 0;
      canvas = drawCrop(src, area, rotation, maxEdge, JPEG_BACKGROUND);
    }
    blob = await toBlob(canvas, "image/jpeg", 0.8);
  }
  canvas.width = canvas.height = 0; // free the backing store now rather than at GC
  if (!blob) throw new Error("Export failed");
  const jpeg = blob.type !== "image/webp";
  return new File([blob], `${base}.${jpeg ? "jpg" : "webp"}`, { type: jpeg ? "image/jpeg" : "image/webp" });
}

/** Never assumes JSON: Netlify answers oversized bodies with an empty 413 before our route runs. */
export async function uploadImage(endpoint: string, file: File, purpose: ImagePurpose): Promise<UploadedImage> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", purpose);
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", body: fd });
  } catch {
    throw new Error(UPLOAD_FAILED);
  }
  if (res.status === 413) throw new Error(TOO_LARGE_413);
  let j: { url?: unknown; accentColor?: unknown; width?: unknown; height?: unknown; error?: unknown } | null = null;
  try {
    j = JSON.parse(await res.text());
  } catch {
    j = null;
  }
  if (!res.ok || !j || typeof j.url !== "string") throw new Error(j && typeof j.error === "string" && j.error ? j.error : UPLOAD_FAILED);
  return {
    url: j.url,
    accentColor: typeof j.accentColor === "string" ? j.accentColor : null,
    width: typeof j.width === "number" ? j.width : undefined,
    height: typeof j.height === "number" ? j.height : undefined,
  };
}

export function ImageCropDialog({
  file,
  aspects,
  maxEdge,
  round = false,
  title = "Crop photo",
  progress,
  busy = false,
  error,
  onCancel,
  onConfirm,
  onSkip,
}: {
  file: File;
  aspects: AspectPreset[];
  maxEdge: number;
  /** Round preview for avatars; the exported image stays square. */
  round?: boolean;
  title?: string;
  /** e.g. "Photo 2 of 3" for multi-file flows. */
  progress?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
  /** Shown as "Skip crop": the whole image, still downscaled and re-encoded. */
  onSkip?: (file: File) => void | Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspectIdx, setAspectIdx] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [media, setMedia] = useState<{ width: number; height: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const sourceRef = useRef<Source | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const working = busy || exporting;

  // Decode once: an <img> for the cropper preview, an ImageBitmap (EXIF-oriented) for drawing when available.
  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    const objectUrl = URL.createObjectURL(file);
    (async () => {
      const img = new Image();
      img.src = objectUrl;
      const [imgRes, bmpRes] = await Promise.allSettled([
        img.decode(),
        typeof createImageBitmap === "function" ? createImageBitmap(file, { imageOrientation: "from-image" }) : Promise.reject(new Error("unsupported")),
      ]);
      if (bmpRes.status === "fulfilled") bitmap = bmpRes.value;
      if (cancelled) return bitmap?.close();
      if (imgRes.status === "rejected" || !img.naturalWidth) return setDecodeError(true);
      // Only trust the bitmap if it agrees with what the preview shows (older engines ignore imageOrientation).
      sourceRef.current =
        bitmap && bitmap.width === img.naturalWidth && bitmap.height === img.naturalHeight
          ? { el: bitmap, width: bitmap.width, height: bitmap.height }
          : { el: img, width: img.naturalWidth, height: img.naturalHeight };
      setMedia({ width: img.naturalWidth, height: img.naturalHeight });
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      sourceRef.current = null;
      bitmap?.close();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Focus, Esc to close, and no background scroll while open.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, working]);

  const onCropComplete = useCallback((_: Area, px: Area) => setArea(px), []);
  const onMediaLoaded = useCallback((m: MediaSize) => setMedia({ width: m.naturalWidth, height: m.naturalHeight }), []);

  const preset = aspects[aspectIdx] ?? aspects[0];
  const natural = media ? (rotation % 180 ? media.height / media.width : media.width / media.height) : 1;
  const aspect = preset?.value ?? natural;

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspectIdx(0);
  }

  async function run(skip: boolean) {
    const src = sourceRef.current;
    const region = skip && src ? { x: 0, y: 0, ...rotatedSize(src.width, src.height, rotation) } : area;
    if (!src || !region || working) return;
    setExporting(true);
    setExportError(null);
    let out: File;
    try {
      out = await exportCrop(src, region, rotation, maxEdge, file.name);
    } catch {
      setExporting(false);
      return setExportError(DECODE_ERROR);
    }
    setExporting(false);
    await (skip && onSkip ? onSkip(out) : onConfirm(out));
  }

  const message = decodeError ? DECODE_ERROR : exportError ?? error;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !working && onCancel()} />
      <div ref={panelRef} tabIndex={-1} className="relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border bg-card text-card-foreground shadow-2xl outline-none sm:m-4 sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 id="crop-title" className="font-semibold">{title}</h2>
            {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onCancel} disabled={working} aria-label="Close"><X /></Button>
        </div>

        <div className="relative h-[min(52dvh,420px)] min-h-[240px] w-full bg-black">
          {url && !decodeError ? (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              minZoom={1}
              maxZoom={4}
              cropShape={round ? "round" : "rect"}
              showGrid={!round}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={onMediaLoaded}
              mediaProps={{ alt: "" }}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-white/70">
              {decodeError ? DECODE_ERROR : <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading image" />}
            </div>
          )}
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {aspects.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Aspect ratio">
              {aspects.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  aria-pressed={i === aspectIdx}
                  onClick={() => setAspectIdx(i)}
                  className={cn("h-8 rounded-lg border px-3 text-xs font-medium transition-colors", i === aspectIdx ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent")}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" className="h-8 min-w-0 flex-1 accent-primary" disabled={!url} />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Button type="button" size="icon" variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)} disabled={!url} aria-label="Rotate 90 degrees" title="Rotate"><RotateCw /></Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={!url}>Reset</Button>
          </div>
          {message && <p role="alert" className="text-sm text-red-400">{message}</p>}
        </div>

        <div className="flex items-center gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {onSkip && <Button type="button" variant="ghost" onClick={() => run(true)} disabled={!url || working}>Skip crop</Button>}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={working}>Cancel</Button>
            <Button type="button" onClick={() => run(false)} disabled={!url || !area || working}>{working && <Loader2 className="animate-spin" />} {busy ? "Uploading" : "Use photo"}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * File picker → crop dialog → upload. Render `ui` once and call `pick()` from any button.
 * With `multiple`, each selected file gets its own dialog in turn; Cancel drops the rest of the queue.
 */
export function useImageUpload({
  endpoint,
  purpose,
  aspects,
  maxEdge,
  round,
  title,
  multiple = false,
  allowSkip = false,
  maxFiles,
  onUploaded,
}: {
  endpoint: string;
  purpose: ImagePurpose;
  aspects: AspectPreset[];
  maxEdge: number;
  round?: boolean;
  title?: string;
  multiple?: boolean;
  allowSkip?: boolean;
  /** Files beyond this (e.g. remaining press photo slots) are ignored. */
  maxFiles?: number;
  onUploaded: (img: UploadedImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<{ id: number; files: File[] }>({ id: 0, files: [] });
  const [index, setIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(() => inputRef.current?.click(), []);
  const close = useCallback(() => {
    setQueue((q) => ({ id: q.id, files: [] }));
    setIndex(0);
    setError(null);
  }, []);

  async function submit(file: File) {
    setUploading(true);
    setError(null);
    try {
      onUploaded(await uploadImage(endpoint, file, purpose));
    } catch (e) {
      setUploading(false);
      return setError((e as Error).message || UPLOAD_FAILED); // stay open so they can retry or cancel
    }
    setUploading(false);
    if (index + 1 < queue.files.length) {
      setIndex(index + 1);
    } else {
      close();
    }
  }

  const current = queue.files[index] ?? null;
  const ui = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, multiple ? Math.max(0, maxFiles ?? Infinity) : 1);
          e.target.value = ""; // picking the same file again should still fire change
          if (!files.length) return;
          setIndex(0);
          setError(null);
          setQueue((q) => ({ id: q.id + 1, files }));
        }}
      />
      {current && (
        <ImageCropDialog
          key={`${queue.id}-${index}`}
          file={current}
          aspects={aspects}
          maxEdge={maxEdge}
          round={round}
          title={title}
          progress={queue.files.length > 1 ? `Photo ${index + 1} of ${queue.files.length}` : undefined}
          busy={uploading}
          error={error}
          onCancel={close}
          onConfirm={submit}
          onSkip={allowSkip ? submit : undefined}
        />
      )}
    </>
  );

  return { pick, ui, uploading, busy: uploading || !!current };
}
