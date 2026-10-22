/**
 * Pure checks for the bio page themes and fonts. No database, no server, no network.
 *
 * Three things this guards, each of which is a bug that would ship silently:
 *
 * 1. An unknown value in the column. The look is stored as free text (`theme`, `font`), so a row
 *    written before this feature, a hand-edited row, or a renamed theme must fall back to the
 *    default rather than render a page with no styling at all.
 * 2. Contrast. Poster paints buttons in the artist's own accent colour, and that colour is
 *    extracted from their artwork — nothing stops a pale yellow cover from putting white text on
 *    a near-white button except readableTextOn, so its answer is asserted at the WCAG boundary.
 * 3. The CSS actually existing. Every theme that claims it needs rules has them in globals.css,
 *    and every rule in globals.css belongs to a theme that still exists. A renamed id otherwise
 *    leaves dead CSS and an unstyled page.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BIO_FONTS,
  BIO_FONT_IDS,
  BIO_THEMES,
  BIO_THEME_IDS,
  DEFAULT_BIO_FONT,
  DEFAULT_BIO_THEME,
  bioFontOf,
  bioSkinClass,
  bioThemeHasGlow,
  bioThemeIsLight,
  bioThemeMeta,
  bioThemeOf,
  posterFill,
  readableTextOn,
} from "../src/lib/bio-themes";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
/** Strip comments before scanning source: test-close learned this the hard way, by matching its own prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const css = code(read("src/app/globals.css"));
const form = code(read("src/components/admin/bio-form.tsx"));
const view = code(read("src/components/public/bio-view.tsx"));
const shell = code(read("src/components/public/artwork-shell.tsx"));
const schema = read("prisma/schema.prisma");
/** SQL comments stripped for the same reason as the TS ones: the first version of the
 * "adds no default" check below failed on the word DEFAULT inside the migration's own comment. */
const migration = read("prisma/migrations/20261025000000_bio_theme_font/migration.sql").replace(/^\s*--.*$/gm, "");

// ---- the catalogue -------------------------------------------------------

check("there are four themes", BIO_THEMES.length === 4, String(BIO_THEMES.length));
check("there are four fonts", BIO_FONTS.length === 4, String(BIO_FONTS.length));
check("theme ids are unique", new Set(BIO_THEME_IDS).size === BIO_THEME_IDS.length);
check("font ids are unique", new Set(BIO_FONT_IDS).size === BIO_FONT_IDS.length);
check("every theme id is a safe css class suffix", BIO_THEME_IDS.every((id) => /^[a-z][a-z0-9-]*$/.test(id)));
check("every theme has a name and a blurb", BIO_THEMES.every((t) => t.name.trim() && t.blurb.trim()));
check("every font has a name and a blurb", BIO_FONTS.every((f) => f.name.trim() && f.blurb.trim()));
check("the defaults are real ids", BIO_THEME_IDS.includes(DEFAULT_BIO_THEME) && BIO_FONT_IDS.includes(DEFAULT_BIO_FONT));

// The picker is sold to someone who does not design. A blurb full of jargon defeats the point.
const JARGON = /\b(hsl|rgba?|css|variable|token|opacity|backdrop|typeface|kerning|tracking)\b/i;
check("no theme blurb uses design jargon", BIO_THEMES.every((t) => !JARGON.test(t.blurb)),
  BIO_THEMES.filter((t) => JARGON.test(t.blurb)).map((t) => t.id).join(", "));
check("no font blurb uses design jargon", BIO_FONTS.every((f) => !JARGON.test(f.blurb)),
  BIO_FONTS.filter((f) => JARGON.test(f.blurb)).map((f) => f.id).join(", "));
check("every blurb is one short line", [...BIO_THEMES, ...BIO_FONTS].every((x) => x.blurb.length <= 60));

// ---- unknown values fall back, they don't render nothing -----------------

for (const bad of ["", "   ", "MIDNIGHT", "neon", "../etc", "null", "undefined"]) {
  check(`theme ${JSON.stringify(bad)} falls back to the default`, bioThemeOf(bad) === DEFAULT_BIO_THEME, bioThemeOf(bad));
  check(`font ${JSON.stringify(bad)} falls back to the default`, bioFontOf(bad) === DEFAULT_BIO_FONT, bioFontOf(bad));
}
check("null theme falls back", bioThemeOf(null) === DEFAULT_BIO_THEME);
check("undefined theme falls back", bioThemeOf(undefined) === DEFAULT_BIO_THEME);
check("null font falls back", bioFontOf(null) === DEFAULT_BIO_FONT);
check("undefined font falls back", bioFontOf(undefined) === DEFAULT_BIO_FONT);
check("every real theme id survives the round trip", BIO_THEME_IDS.every((id) => bioThemeOf(id) === id));
check("every real font id survives the round trip", BIO_FONT_IDS.every((id) => bioFontOf(id) === id));
check("bioThemeMeta never returns undefined", BIO_THEME_IDS.every((id) => bioThemeMeta(id).id === id));

// ---- contrast on the one theme that can't be checked by eye --------------

// White text on a solid block needs the block dark enough; black text needs it light enough.
check("white on near-black", readableTextOn("#000000") === "#ffffff");
check("white on droplr purple", readableTextOn("#7c3aed") === "#ffffff");
check("black on white", readableTextOn("#ffffff") === "#0a0a0a");
check("black on pale yellow", readableTextOn("#fde68a") === "#0a0a0a");
check("black on cyan", readableTextOn("#22d3ee") === "#0a0a0a");
check("black on lime", readableTextOn("#a3e635") === "#0a0a0a");
check("white on deep red", readableTextOn("#7f1d1d") === "#ffffff");
check("white on navy", readableTextOn("#1e3a8a") === "#ffffff");
check("a missing colour assumes the dark default", readableTextOn(null) === "#ffffff" && readableTextOn(undefined) === "#ffffff");
check("a malformed colour assumes the dark default", readableTextOn("rebeccapurple") === "#ffffff" && readableTextOn("#abc") === "#ffffff");
check("case and a missing hash both parse", readableTextOn("FDE68A") === "#0a0a0a" && readableTextOn("#FDE68A") === "#0a0a0a");

/** The real test: whichever colour it picks must clear 4.5:1 on that background. */
function ratio(fg: string, bg: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
const SWEEP: string[] = [];
for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
  SWEEP.push("#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""));
}
// The button is painted with posterFill, not the raw accent, and the ink is chosen for the fill.
const worst = SWEEP.map((c) => { const f = posterFill(c); return { c, f, r: ratio(readableTextOn(f), f) }; }).sort((a, b) => a.r - b.r)[0];
check(`every accent in a 216-colour sweep clears 4.5:1 once filled (worst ${worst.r.toFixed(2)}:1, ${worst.c} \u2192 ${worst.f})`, worst.r >= 4.5);

// Two negative controls, because this is the whole reason the two helpers exist.
const fixedWorst = SWEEP.map((c) => ratio("#ffffff", c)).sort((a, b) => a - b)[0];
check(`a hardcoded white would have failed the sweep (worst ${fixedWorst.toFixed(2)}:1)`, fixedWorst < 4.5);
const rawWorst = SWEEP.map((c) => ratio(readableTextOn(c), c)).sort((a, b) => a - b)[0];
check(`picking the ink but NOT adjusting the fill would also have failed (worst ${rawWorst.toFixed(2)}:1)`, rawWorst < 4.5);

// A fill that already reads is left alone: the artist's colour should only move when it must.
check("an accent that already passes is returned untouched", posterFill("#7c3aed") === "#7c3aed" && posterFill("#000000") === "#000000");
check("a mid-tone accent is moved", posterFill("#339999") !== "#339999");
check("a malformed accent falls back to droplr purple", posterFill("rebeccapurple") === "#7c3aed" && posterFill(null) === "#7c3aed");

// ---- behaviour flags -----------------------------------------------------

check("paper is the only light theme", BIO_THEME_IDS.filter((id) => bioThemeIsLight(id)).join() === "paper");
check("mono is the only theme without the glow", BIO_THEME_IDS.filter((id) => !bioThemeHasGlow(id)).join() === "mono");
check("the default theme keeps the signature dark glow", !bioThemeIsLight(DEFAULT_BIO_THEME) && bioThemeHasGlow(DEFAULT_BIO_THEME));

// ---- the CSS exists, and nothing in it is orphaned -----------------------

// Midnight is the bare shell and Paper reuses shell-theme-light: neither needs its own block.
const NEEDS_CSS = ["mono", "poster"];
for (const id of NEEDS_CSS) check(`.${bioSkinClass(id as never)} has rules`, css.includes(`.${bioSkinClass(id as never)} `));
const orphans = [...css.matchAll(/\.bio-skin-([a-z0-9-]+)/g)].map((m) => m[1]).filter((id) => !BIO_THEME_IDS.includes(id as never));
check("no bio-skin rule names a theme that no longer exists", orphans.length === 0, [...new Set(orphans)].join(", "));
check("poster paints buttons from the adjusted fill, not the raw accent", /\.bio-skin-poster \.glass \{[^}]*var\(--shell-fill/.test(css));
check("poster takes its text colour from the computed ink, not a hardcoded white", /\.bio-skin-poster \.glass \{[^}]*var\(--shell-ink/.test(css));
// The ink has to be computed from whatever will actually be painted. Once a page can choose its
// own button colour, deriving the ink from the accent instead would put white text on a pale
// button the moment the two differ.
check("the shell computes the ink from the fill that gets painted",
  /--shell-ink[^,]*readableTextOn\(fill \?\? posterFill\(accent\)\)/.test(shell));
check("the fill and the ink are derived from the same value",
  /--shell-fill[^,]*fill \?\? posterFill\(accent\)/.test(shell));
check("a chosen button colour is corrected for contrast before it is painted",
  /const fill = buttonColor \? posterFill\(buttonColor\) : null/.test(shell),
  "Poster fills solid, so an uncorrected colour would be unreadable small text");
check("the bubble variable is only set when a colour was chosen",
  /\.\.\.\(buttonColor \? \{ \["--bubble"/.test(shell),
  "otherwise every page gets a tint it never asked for");
// With --bubble unset, each color-mix must fall back to the theme's own value on BOTH sides, or
// every existing page shifts by a few percent the day this ships.
const mixes = [...css.matchAll(/color-mix\(in srgb, var\(--bubble, ([^)]+\)?[^)]*)\) \d+%, ([^)]+\))\)/g)];
check("every button-colour fallback is the theme's own value", mixes.length >= 6 && mixes.every((m) => m[1].trim() === m[2].trim()),
  mixes.filter((m) => m[1].trim() !== m[2].trim()).map((m) => `${m[1]} vs ${m[2]}`).join(" | ") || `${mixes.length} mixes found`);
check("mono squares its buttons", /\.bio-skin-mono \.glass \{[^}]*border-radius: 0/.test(css));

// ---- the glow switch actually reaches every surface ----------------------
//
// "Turn the glow off" looked broken on three themes out of four, twice over, for two different
// reasons — and neither was the switch itself:
//
//   1. the admin preview rendered <BioView> without the glow prop, so it defaulted to on. Mono
//      looked fixed only because that theme never had a glow to begin with;
//   2. the light treatment painted its own accent radial, unconditionally, so Paper kept glowing
//      on the real page as well.
//
// Both were a value that simply never arrived. These check it arrives.
{
  const sources = ["src/components/public/bio-route.tsx", "src/components/admin/bio-form.tsx"];
  for (const f of sources) {
    const src = code(read(f));
    const uses = [...src.matchAll(/<BioView[\s\S]{0,1200}?\/>/g)];
    check(`${f} renders BioView`, uses.length > 0);
    check(`every BioView in ${f} is given the glow setting`, uses.every((m) => /\sglow=/.test(m[0])),
      "a preview that ignores it is how this looked broken for three themes");
  }
}
check("the glow prop is required on the admin form, not optional",
  /glow: \{ on: boolean; color: string \| null \};/.test(code(read("src/components/admin/bio-form.tsx"))),
  "optional is how the value silently fails to arrive");
check("the light treatment honours the glow switch",
  /shell-light-layer[\s\S]{0,200}background: glow/.test(shell),
  "Paper paints its own accent radial and has to be gated too");
check("the dark wash honours it", /\{glow && <div className="absolute inset-0"/.test(shell));
check("the artwork halo honours it", /boxShadow[\s\S]{0,40}: undefined/.test(shell));

// ---- the wiring ----------------------------------------------------------

check("the renderer resolves both values through the fallbacks", view.includes("bioThemeOf(page.theme)") && view.includes("bioFontOf(page.font)"));
check("the renderer passes the skin and the font class to the shell", view.includes("bioSkinClass(skin)") && view.includes("bioFontClass(font)"));
check("the renderer turns the glow off for the theme that asks", view.includes("bioThemeHasGlow(skin)"));
// The pickers live in PageLookFields, shared with the release page's Look tab, and the bio form
// renders that component. Both halves are checked: the pickers exist, and the form uses them.
const lookFields = code(read("src/components/admin/page-look-fields.tsx"));
check("the bio form renders the shared look pickers", form.includes("<PageLookFields"));
check("the admin form offers every theme", BIO_THEMES.every(() => lookFields.includes("BIO_THEMES.map")));
check("the admin form offers every font", lookFields.includes("BIO_FONTS.map"));
check("each font option is rendered in its own font", lookFields.includes("bioFontClass(f.id)"));
check("the live preview is given the chosen look", /theme: v\.theme, font: v\.font/.test(form));
check("the picker tiles report their state to a screen reader", /aria-pressed=\{on\}/.test(lookFields));

// ---- the column ----------------------------------------------------------

check("the schema has both columns, nullable", /model BioPage[\s\S]*?theme\s+String\?[\s\S]*?font\s+String\?[\s\S]*?\n}/.test(schema));
check("the migration is idempotent", (migration.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length === 2);
check("the migration adds no default", !/DEFAULT/i.test(migration));
check("the migration touches only BioPage", [...migration.matchAll(/ALTER TABLE "(\w+)"/g)].every((m) => m[1] === "BioPage"));
check("the API never runs prisma migrate dev", !migration.includes("migrate dev"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
