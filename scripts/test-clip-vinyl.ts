/**
 * The Vinyl / CD clip style: the record turns at the right speed, the needle lands on the record,
 * and the sleeve really leaves.
 *
 * What this defends:
 *  - the spin-up is continuous and settles at a real 33⅓ (a jump in the angle reads as a glitch);
 *  - the tonearm geometry: the stylus lands where it's asked to, on the record, and creeps
 *    inwards. Off by a sign and the needle plays the air beside the disc;
 *  - the needle is parked before the first kick and down after it;
 *  - the sleeve is gone once the record has centred, and CDs have no tonearm;
 *  - the words and link land exactly as Motion's do, because it is Motion's composition;
 *  - "Out of the sleeve" on the plain Motion card falls back instead of drawing nothing.
 *
 * Pure functions and a recording canvas: no database, no browser.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { armAngle, CLIP_STYLES, DISC_ENTRANCES, discTurns, drawMotionFrame, VINYL_RPM, type DiscOptions, type MotionOptions } from "../src/lib/clip-motion";
import { clipPalette } from "../src/lib/clip-theme";
const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` (${detail})`}`);
};
const FPS = 30;

console.log("spin");
check("33⅓ rpm", Math.abs(VINYL_RPM - 33.3333) < 0.001);
const rps = VINYL_RPM / 60;
check("no turning before the spin starts", discTurns(0.5, 0.9, rps) === 0);
check("spin-up is continuous: no jump at the end of the ramp", Math.abs(discTurns(0.9 + 0.6 - 1e-6, 0.9, rps) - discTurns(0.9 + 0.6 + 1e-6, 0.9, rps)) < 1e-4);
const slope = (discTurns(5.01, 0.9, rps) - discTurns(5, 0.9, rps)) / 0.01;
check("then a steady 33⅓", Math.abs(slope - rps) < 1e-6, String(slope));

console.log("tonearm geometry");
// The same numbers drawMotionFrame uses for a 9:16: card side 760, top 400.
const R = 380, cx = 540, cy = 780, px = cx + R * 1.02, py = cy - R * 1.02, len = R * 1.25;
let prev = -Infinity, allOn = true, mono = true;
for (const f of [0.92, 0.85, 0.78, 0.72]) {
  const th = armAngle(px, py, len, cx, cy, R * f);
  const d = Math.hypot(px + Math.cos(th) * len - cx, py + Math.sin(th) * len - cy);
  if (Math.abs(d - R * f) > 0.5) allOn = false;
  if (th <= prev) mono = false;
  prev = th;
}
check("the stylus lands where it's asked to, to half a pixel", allOn);
check("further in means a bigger swing", mono);

console.log("drawing");
type Op = { kind: string; a?: number[]; text?: string };
function record(disc: DiscOptions | undefined, i: number, options: Partial<MotionOptions>, frames = 30 * FPS): Op[] {
  const ops: Op[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif", fillStyle: "#000", globalAlpha: 1 };
  const grad = { addColorStop() {} };
  const ctx = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "measureText") return (s: string) => ({ width: s.length * 20 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createConicGradient") return () => grad;
      if (k === "fillText") return (text: string) => ops.push({ kind: "text", text });
      return (...a: unknown[]) => { ops.push({ kind: k, a: a.filter((v) => typeof v === "number") as number[] }); };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawMotionFrame({
    ctx, width: 1080, height: 1920, progress: 0, bands: null, kick: 0, art: {} as CanvasImageSource, fontFamily: "x", logo: null,
    palette: clipPalette("glow", "#E8432F"), copy: { headline: "OUT NOW", tagline: "Ototo — Again", link: "droplr.fm/x", mark: "droplr.fm" },
    i, frames, fps: FPS, cues: { firstKick: 60, drop: 300 }, options, disc,
  });
  return ops;
}
const vinyl: DiscOptions = { kind: "vinyl", ring: false };
const images = (ops: Op[]) => ops.filter((o) => o.kind === "drawImage").length;
const armEnd = (ops: Op[]) => { const l = ops.filter((o) => o.kind === "lineTo"); return l.length ? l[l.length - 1].a! : null; };

check("in the sleeve: the sleeve and the label are both drawn", images(record(vinyl, 9, { entrance: "sleeve" })) === 2);
check("once the record has centred the sleeve is gone", images(record(vinyl, 90, { entrance: "sleeve" })) === 1);
const parked = armEnd(record(vinyl, 55, { entrance: "still" }));
const down = armEnd(record(vinyl, 120, { entrance: "still" }));
const late = armEnd(record(vinyl, 850, { entrance: "still" }));
const r = (p: number[] | null) => (p ? Math.hypot(p[0] - cx, p[1] - cy) : NaN);
check("before the first kick the needle is parked off the record", r(parked) > R, String(r(parked)));
check("after it the needle is on the record", r(down) < R && r(down) > R * 0.6, String(r(down)));
check("…and creeps inwards over the clip", r(late) < r(down), `${r(down)} → ${r(late)}`);
check("a CD has no tonearm", armEnd(record({ kind: "cd", ring: false }, 120, { entrance: "still" })) === null);
check("the ring draws bars round the disc", record({ kind: "cd", ring: true }, 120, { entrance: "still" }).filter((o) => o.kind === "lineTo").length === 88);
const atDrop = record(vinyl, 340, { entrance: "sleeve" });
check("the title and the link land as in Motion", atDrop.some((o) => o.text === "OUT NOW") && atDrop.some((o) => o.text === "droplr.fm/x"));
check("'Out of the sleeve' on the plain card falls back to a fade, and still draws the card", images(record(undefined, 90, { entrance: "sleeve" })) === 1);
check("the resting preview shows the record and the needle down", images(record(vinyl, -1, { entrance: "sleeve" })) === 1 && r(armEnd(record(vinyl, -1, { entrance: "sleeve" }))) < R);

console.log("wiring");
check("Vinyl / CD is a clip style", (CLIP_STYLES as readonly string[]).includes("vinyl"));
check("its first entrance is the sleeve", DISC_ENTRANCES[0] === "sleeve");
check("the clip page passes the disc only for the vinyl style", /style === "vinyl"[\s\S]{0,200}disc: \{ kind: discKind, ring: discRing \}/.test(read("src/components/admin/clip-forge.tsx")));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
