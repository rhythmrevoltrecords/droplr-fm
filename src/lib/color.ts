/** Extract a dark-friendly accent colour from cover art. Falls back to a neutral violet. */
export async function extractAccentColor(imageUrl: string): Promise<string> {
  const fallback = "#6D28D9";
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return fallback;
    const buf = Buffer.from(await res.arrayBuffer());
    return await accentFromBuffer(buf);
  } catch {
    return fallback;
  }
}

export async function accentFromBuffer(buf: Buffer): Promise<string> {
  try {
    const { Vibrant } = await import("node-vibrant/node");
    const palette = await Vibrant.from(buf).getPalette();
    const swatch = palette.Vibrant ?? palette.DarkVibrant ?? palette.Muted ?? palette.DarkMuted;
    return swatch?.hex ?? "#6D28D9";
  } catch {
    return "#6D28D9";
  }
}
