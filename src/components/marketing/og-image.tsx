import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MARK_WHITE_PNG } from "./og-mark";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "droplr.fm: run your label's releases from one place";

async function font(file: string) {
  try {
    return await readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));
  } catch {
    return null; // falls back to the built-in font
  }
}

/** Static social card for the homepage (rendered once at build). */
export async function renderOgImage() {
  const [bold, regular] = await Promise.all([font("Geist-Bold.ttf"), font("Geist-Regular.ttf")]);
  const fonts = [
    ...(bold ? [{ name: "Geist", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Geist", data: regular, weight: 400 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#0c0a14",
          backgroundImage:
            "radial-gradient(circle at 50% -10%, rgba(139,92,246,0.55) 0%, rgba(124,58,237,0.18) 40%, rgba(12,10,20,0) 70%), radial-gradient(circle at 100% 100%, rgba(217,70,239,0.22) 0%, rgba(12,10,20,0) 45%)",
          color: "#fff",
          fontFamily: fonts.length ? "Geist" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={MARK_WHITE_PNG} width={64} height={64} style={{ objectFit: "contain" }} />
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.02em" }}>droplr.fm</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: 980 }}>Run your label&apos;s releases from one place.</div>
          <div style={{ marginTop: 28, fontSize: 32, fontWeight: 400, color: "rgba(255,255,255,0.72)", maxWidth: 980 }}>
            Smart links and email pre-saves today. Roster, release planning and royalties next.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 24, color: "rgba(255,255,255,0.8)" }}>
          {["Smart links", "Email pre-saves", "Label roster"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "8px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.06)" }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
