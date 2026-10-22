/**
 * Release page looks (the Look tab) and the short download promo plan. No database, no server.
 *
 * The routes themselves (tenancy, the 402 that writes nothing, own-uploads-only backgrounds) are
 * in scripts/test-security.ts section 15d.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasCustomLook, lookUpdate, lookWarnings, pageLookSchema, resolveLook } from "../src/lib/page-look";
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
check("the icon on/off switch is outside the paid check", lookRoute.includes("const { socialIcons, ...lookInput } = parsed.data;") && lookRoute.includes("const data = lookUpdate(lookInput);") && /setsSomething = Object\.values\(data\)/.test(lookRoute));
check("bio pages store plain icons as NULL too", read("src/app/api/admin/bio/[id]/route.ts").includes('d.iconStyle !== "plain"'));
check("bio pages render text colour, glow colour and icon style", (() => { const v = read("src/components/public/bio-view.tsx"); return v.includes("textColor={page.textColor}") && v.includes("page.glowColor || glow.color") && v.includes("iconStyleOf(page.iconStyle)"); })());

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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
