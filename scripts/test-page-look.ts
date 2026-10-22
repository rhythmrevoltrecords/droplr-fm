/**
 * Release page looks (the Look tab) and the short download promo plan. No database, no server.
 *
 * The routes themselves (tenancy, the 402 that writes nothing, own-uploads-only backgrounds) are
 * in scripts/test-security.ts section 15d.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasCustomLook, lookUpdate, lookWarnings, pageLookSchema, pageModeOf, resolveLook } from "../src/lib/page-look";
import { PLAN_LIMITS, type PlanKey } from "../src/lib/plans";
import { downloadPromoSteps, promoSteps, promoStepsFor } from "../src/lib/promo";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail !== undefined ? ` (${String(detail)})` : ""}`); }
}
const read = (f: string) => readFileSync(join(import.meta.dirname, "..", f), "utf8");

console.log("1. The look values");
check("a full look parses", pageLookSchema.safeParse({ theme: "poster", font: "serif", buttonColor: "#FF6B00", backgroundColor: "#112233", backgroundUrl: "" }).success);
check("an unknown theme is refused", !pageLookSchema.safeParse({ theme: "neon" }).success);
check("a colour that isn't #rrggbb is refused", !pageLookSchema.safeParse({ buttonColor: "red" }).success && !pageLookSchema.safeParse({ backgroundColor: "#12" }).success);
check("an extra field is refused, not ignored", !pageLookSchema.safeParse({ theme: "mono", title: "renamed" }).success);
const cleared = lookUpdate({ theme: "", font: null, buttonColor: "" });
check("empty and null both store NULL", cleared.theme === null && cleared.font === null && cleared.buttonColor === null, JSON.stringify(cleared));
check("a field that wasn't sent isn't touched", !("backgroundUrl" in lookUpdate({ theme: "mono" })));
const both = lookUpdate({ backgroundUrl: "https://x/api/cover/a.webp", backgroundColor: "#112233" });
check("an image and a colour sent together: the image wins", both.backgroundUrl !== null && both.backgroundColor === null, JSON.stringify(both));
const colour = lookUpdate({ backgroundColor: "#112233" });
check("setting a colour clears the image", colour.backgroundUrl === null && colour.backgroundColor === "#112233");
// Silent on ordinary input: a release nobody touched must render with no skin at all.
check("a page with nothing set is not custom", !hasCustomLook({}) && !hasCustomLook({ theme: null, font: null }) && !resolveLook({}).custom);
check("…and resolves to the bio defaults", resolveLook({}).theme === "midnight" && resolveLook({}).font === "clean" && resolveLook({}).background === null);
check("one field set makes it custom", hasCustomLook({ buttonColor: "#ff6b00" }));
check("a junk stored value falls back to the default theme", resolveLook({ theme: "neon" }).theme === "midnight");

console.log("1b. Text, glow and icons");
check("text, glow and icon fields parse", pageLookSchema.safeParse({ textColor: "#FFD166", glowColor: "#06D6A0", iconStyle: "solid", iconColor: "#101820" }).success);
check("an unknown icon style is refused", !pageLookSchema.safeParse({ iconStyle: "sparkly" }).success);
check("plain icons are stored as NULL, the row as it always was", lookUpdate({ iconStyle: "plain" }).iconStyle === null && lookUpdate({ iconStyle: "brand" }).iconStyle === "brand");
check("an unknown stored icon style draws plain", resolveLook({ iconStyle: "sparkly" }).iconStyle === "plain");
// Silent on ordinary input: no text colour picked, nothing to say, whatever the theme.
check("no warning without a picked text colour", ["midnight", "paper", "mono", "poster"].every((t) => lookWarnings({ theme: t }).length === 0));
check("white text on the dark default reads", lookWarnings({ theme: "midnight", textColor: "#ffffff" }).length === 0);
check("near-black text on the dark default is warned about", lookWarnings({ theme: "midnight", textColor: "#111111" }).some((w) => /hard to read/.test(w)));
check("dark text on Paper reads", lookWarnings({ theme: "paper", textColor: "#222222" }).length === 0);
check("pale text on a pale picked background is warned about", lookWarnings({ theme: "midnight", textColor: "#eeeeee", backgroundColor: "#fafafa" }).length === 1);
check("with an image behind it, droplr says it can't tell", lookWarnings({ textColor: "#111111", backgroundUrl: "https://x/api/cover/a.webp" }).some((w) => /can't measure/.test(w)));

console.log("2. Plans");
for (const k of Object.keys(PLAN_LIMITS) as PlanKey[]) {
  check(`${k}: page looks ${k === "free" ? "off" : "on"}`, PLAN_LIMITS[k].pageLooks === (k !== "free"));
}
const copy = read("src/lib/plan-copy.ts");
check("the plan table mentions page looks", /page look|own look/i.test(copy));

console.log("3. Wiring");
const route = read("src/app/api/admin/releases/[id]/look/route.ts");
check("the look route checks the plan flag", route.includes("planOf(org?.plan).pageLooks"));
check("the look route answers 402 before writing", route.indexOf("status: 402") > 0 && route.indexOf("status: 402") < route.indexOf("prisma.release.update"));
check("the look route only accepts droplr's own images", route.includes("isOwnImage(data.backgroundUrl, SITE_URL)"));
for (const f of ["src/components/public/release-view.tsx", "src/components/public/gate-view.tsx"]) {
  check(`${f.split("/").pop()} renders the look`, read(f).includes("lookShell(release.look"));
}
const pr = read("src/components/public/public-route.tsx");
check("both public pages are given the stored look", (pr.match(/look: lookOf\(release\)/g) ?? []).length === 2);
check("download pages get the icon row when it's switched on", /socials: showSocials\(release\)/.test(pr) && read("src/components/public/gate-view.tsx").includes("<SocialIcons icons={release.socials"));
const detail = read("src/app/admin/releases/[id]/page.tsx");
check("the release page has a Look tab", detail.includes('{ key: "look", label: "Look" }'));
check("the Look tab hides the controls on plans without looks", detail.includes("canEdit={plan.pageLooks}"));
check("bio and release pages share one set of look controls", read("src/components/admin/bio-form.tsx").includes("<PageLookFields") && read("src/components/admin/release-look-editor.tsx").includes("<PageLookFields"));

const icons = read("src/components/public/social-icons.tsx");
check("Original icons use each network's colour", icons.includes("platformMeta(s.key).color"));
check("solid icons cut the mark out in a colour that reads on the fill", icons.includes("readableTextOn(color)"));
check("the marks are framed, never traced: the path is drawn filled every time", !/stroke=/.test(icons) && icons.includes('fill="currentColor"'));
const css = read("src/app/globals.css");
check("the text colour rules exist and come after the light theme's", css.indexOf(".page-ink .text-white") > css.indexOf(".shell-theme-light .text-white"));
check("Poster's button ink is more specific than the text colour", css.includes(".bio-skin-poster .glass .text-white") && !css.includes(".page-ink .glass"));
const lookRoute = read("src/app/api/admin/releases/[id]/look/route.ts");
check("the icon on/off switch is outside the paid check", /const \{ socialIcons, [^}]*\.\.\.lookInput \} = parsed\.data;/.test(lookRoute) && /const data[^=]*= lookUpdate\(lookInput\);/.test(lookRoute) && /setsSomething = Object\.values\(data\)/.test(lookRoute));
check("bio pages store plain icons as NULL too", read("src/app/api/admin/bio/[id]/route.ts").includes('d.iconStyle !== "plain"'));
check("bio pages render text colour, glow colour and icon style", (() => { const v = read("src/components/public/bio-view.tsx"); return v.includes("textColor={page.textColor}") && v.includes("page.glowColor || glow.color") && v.includes("iconStyleOf(page.iconStyle)"); })());

console.log("3b. Download analytics");
const panels = read("src/components/admin/stats-panels.tsx");
const detailNow = read("src/app/admin/releases/[id]/page.tsx");
check("the analytics tab passes gate numbers for a download, and none for a release", detailNow.includes("gate={isDownload ? await gateStatsFor(release.id, days) : null}"));
check("a gate's cards are views, started, got the file and rates, not pre-saves", /gate\s*\?\s*\[[\s\S]*?"Got the file"[\s\S]*?\]\s*:\s*\[[\s\S]*?"Pre-saves"/.test(panels));
check("the pre-save column and the store-choice card are hidden on a gate", panels.includes('{!gate && <TH className="text-right">Pre-saves</TH>}') && /\{!gate && \(\s*<Card>\s*<CardHeader><CardTitle>Where pre-savers listen/.test(panels));
check("the chart and heatmap drop their pre-save series on a gate", panels.includes("presaves={!gate}") && panels.includes("presaves={gate ? null : stats.heat.presaves}"));
check("the pre-save report link isn't offered on a gate", detailNow.includes("{!isDownload && <ReportShare"));
// Silent on ordinary input: a release's panel is exactly what it was.
check("a release still gets its pre-save cards", /"Conv\. rate"/.test(panels) && panels.includes("gate = null"));


console.log("3c. Page mode (light, dark, system)");
check("an unknown or empty mode is dark", pageModeOf(null) === "dark" && pageModeOf("neon") === "dark" && pageModeOf("system") === "system");
const lr2 = read("src/app/api/admin/releases/[id]/look/route.ts");
check("the mode is outside the paid check", /const \{ socialIcons, pageMode, [^}]*\.\.\.lookInput \} = parsed\.data;/.test(lr2) && /setsSomething = Object\.values\(data\)/.test(lr2));
const prNow = read("src/components/public/public-route.tsx");
check("release and download pages use their own mode, not the account's", (prNow.match(/theme=\{pageModeOf\(release\.pageMode\)\}/g) ?? []).length === 2 && !/publicTheme/.test(prNow));
check("the account-wide public switch is gone from Settings and its API", !/themePublic|applyPublic/.test(read("src/components/admin/settings-forms.tsx")) && !/themePublic/.test(read("src/app/api/admin/org/route.ts")));
check("a chosen look decides light or dark by its theme", read("src/components/public/page-look-shell.ts").includes('bioThemeIsLight(l.theme) ? "light" : "dark"'));
const modeSql = read("prisma/migrations/20261107000000_page_mode/migration.sql");
check("the migration carries the old switch over, only onto unset pages", /"pageMode" IS NULL/.test(modeSql) && /"theme" IS NULL/.test(modeSql) && !/DROP\s+(COLUMN|TABLE)/i.test(modeSql));

console.log("4. Download promo plan");
const dl = downloadPromoSteps("label");
const words = dl.map((s) => `${s.title} ${s.body}`).join(" ");
check("shorter than the release plan", dl.length > 0 && dl.length <= 8 && dl.length < promoSteps("label").length, dl.length);
check("no pre-save, store, Spotify-pitch or release-day steps", !/pre-?save|spotify|store|release day|beatport|editorial/i.test(words), words.match(/pre-?save|spotify|store|release day|beatport|editorial/i)?.[0]);
check("no step points at a tab a download gate doesn't have", dl.every((s) => s.tab !== "links" && s.tab !== "presaves"));
check("nothing is due before the gate exists", dl.every((s) => s.day >= 0));
check("download step keys don't collide with release step keys", dl.every((s) => !promoSteps("label").some((r) => r.key === s.key)));
check("a download gets the download plan, a release the release plan", promoStepsFor("label", "download")[0].key === dl[0].key && promoStepsFor("label", "release")[0].key === promoSteps("label")[0].key && promoStepsFor("label", null)[0].key === promoSteps("label")[0].key);
const reminders = read("src/lib/promo-reminders.ts");
check("reminders and the dashboard use the per-kind plan", (reminders.match(/promoStepsFor\(/g) ?? []).length === 2 && !/promoSteps\(r\./.test(reminders));

console.log("5. Background blur");
const blurDone = (async () => {
  // Real sharp, real storeImage. Run in a temp directory: outside Netlify, storeImage writes to
  // <cwd>/public/uploads, and a test should never leave files in the repo.
  const { mkdtemp, mkdir, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { default: sharp } = await import("sharp");
  const { SITE_URL } = await import("../src/lib/env");
  const { backgroundPatch } = await import("../src/lib/background-blur");
  const home = process.cwd();
  const dir = await mkdtemp(path.join(tmpdir(), "droplr-blur-"));
  process.chdir(dir);
  try {
    await mkdir(path.join(dir, "public", "uploads"), { recursive: true });
    // A hard-edged checkerboard: blur shows up as a big drop in contrast between neighbours.
    // Squares big enough (80px) that the soft and strong radii still differ measurably.
    const W = 640, raw = Buffer.alloc(W * W * 3);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) raw.fill((Math.floor(x / 80) + Math.floor(y / 80)) % 2 ? 255 : 0, (y * W + x) * 3, (y * W + x) * 3 + 3);
    const name = "blurtest.webp";
    await sharp(raw, { raw: { width: W, height: W, channels: 3 } }).webp({ lossless: true }).toFile(path.join(dir, "public", "uploads", name));
    const original = `${SITE_URL}/uploads/${name}`;
    const edge = async (file: string) => {
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      // The sharpest step between horizontal neighbours (within a row): 255 at a hard edge, small once blurred.
      const c = info.channels;
      let max = 0;
      for (let y = 0; y < info.height; y++) for (let x = 1; x < info.width; x++) {
        const i = (y * info.width + x) * c;
        max = Math.max(max, Math.abs(data[i] - data[i - c]));
      }
      return max;
    };

    const none = await backgroundPatch({ backgroundUrl: original, backgroundBlur: "none" }, null);
    check("no blur shows the original and keeps no copy", none.ok && none.patch.backgroundUrl === original && none.patch.backgroundSourceUrl === null && none.patch.backgroundBlur === null);
    const soft = await backgroundPatch({ backgroundUrl: original, backgroundBlur: "soft" }, null);
    const softFile = soft.ok && soft.patch.backgroundUrl ? path.join(dir, "public", "uploads", path.basename(soft.patch.backgroundUrl)) : "";
    check("a blur stores a new image and keeps the original", soft.ok && soft.patch.backgroundUrl !== original && soft.patch.backgroundSourceUrl === original && soft.patch.backgroundBlur === "soft", JSON.stringify(soft));
    const before = await edge(path.join(dir, "public", "uploads", name));
    const after = softFile ? await edge(softFile) : before;
    check("…and the stored image really is blurred", after < before * 0.25, `${before.toFixed(1)} → ${after.toFixed(1)}`);
    const strong = await backgroundPatch({ backgroundUrl: original, backgroundBlur: "strong" }, null);
    const strongEdge = strong.ok && strong.patch.backgroundUrl ? await edge(path.join(dir, "public", "uploads", path.basename(strong.patch.backgroundUrl))) : before;
    check("strong is blurrier than soft", strongEdge < after, `${after.toFixed(1)} vs ${strongEdge.toFixed(1)}`);
    const stored = { backgroundUrl: soft.ok ? soft.patch.backgroundUrl ?? null : null, backgroundSourceUrl: original, backgroundBlur: "soft" };
    const again = await backgroundPatch({ backgroundUrl: original, backgroundBlur: "soft" }, stored);
    check("saving again with nothing changed re-uses the blurred copy", again.ok && again.patch.backgroundUrl === stored.backgroundUrl);
    const change = await backgroundPatch({ backgroundUrl: original, backgroundBlur: "strong" }, stored);
    check("changing the amount blurs the original, not the blurred copy", change.ok && change.patch.backgroundSourceUrl === original && change.patch.backgroundUrl !== stored.backgroundUrl);
    const off = await backgroundPatch({ backgroundUrl: original, backgroundBlur: "none" }, stored);
    check("turning blur off goes back to the original", off.ok && off.patch.backgroundUrl === original && off.patch.backgroundSourceUrl === null);
    const cleared = await backgroundPatch({ backgroundUrl: "", backgroundBlur: "soft" }, stored);
    check("removing the image clears all three", cleared.ok && cleared.patch.backgroundUrl === null && cleared.patch.backgroundSourceUrl === null && cleared.patch.backgroundBlur === null);
    const outside = await backgroundPatch({ backgroundUrl: "https://tracker.example.com/p.png", backgroundBlur: "soft" }, null);
    check("an outside image is refused before anything is fetched", !outside.ok);
    const untouched = await backgroundPatch({}, stored);
    check("nothing sent, nothing touched", untouched.ok && Object.keys(untouched.patch).length === 0);
    void readFile;
  } finally {
    process.chdir(home);
    await rm(dir, { recursive: true, force: true });
  }
})();
const shellSrc = read("src/components/public/artwork-shell.tsx");
check("the live page never gets a CSS blur: only the editor preview does", /preview && background\.blur && background\.blur !== "none"/.test(shellSrc));
check("public pages are handed the stored image, not a blur level", !/backgroundBlur/.test(read("src/components/public/public-route.tsx")) && !/backgroundBlur/.test(read("src/components/public/bio-route.tsx")));
const lr = read("src/app/api/admin/releases/[id]/look/route.ts");
check("the release route blurs only after the plan check", lr.indexOf("status: 402") < lr.indexOf("await backgroundPatch("));

void blurDone.then(() => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}, (e) => { console.error(e); process.exit(1); });
