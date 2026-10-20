/**
 * Pure checks on the admin navigation. No database, no server, no network.
 *
 * This suite exists because of a feature nobody could reach. Items marked `wide` are hidden from
 * the desktop nav below 1536px so the bar never wraps, on the stated grounds that they have
 * "another way in (Settings, or the address bar)". For Integrations that was false: the settings
 * jump list did not link it, and the installed app has no address bar. SoundCloud gates and the
 * Mailchimp sync were therefore unreachable in the UI on a 1440px laptop — which is most laptops,
 * including the one droplr is built on. It shipped, it was never noticed, and nothing failed.
 *
 * Two guarantees, both cheap and both source-level:
 *   1. Every nav item points at a route that exists.
 *   2. Every `wide` item is linked from the settings jump list, so hiding it hides a shortcut
 *      rather than the only door.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; return; }
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const layout = read("src/app/admin/layout.tsx");
const settings = read("src/app/admin/settings/page.tsx");

/** { href, label, wide } for each entry in the nav array. */
const items = [...layout.matchAll(/\{\s*href:\s*"(\/[^"]*)"\s*,\s*label:\s*"([^"]+)"([^}]*)\}/g)]
  .map((m) => ({ href: m[1], label: m[2], wide: /wide:\s*true/.test(m[3]) }));

check("the nav array was found and parsed", items.length >= 8, `${items.length} items`);
check("every item has a label", items.every((i) => i.label.trim().length > 0));
check("hrefs are unique", new Set(items.map((i) => i.href)).size === items.length,
  items.map((i) => i.href).filter((h, n, a) => a.indexOf(h) !== n).join(", "));

/** An App Router path exists if some page.tsx sits at it. */
function routeExists(href: string) {
  const dir = join(root, "src/app", href.replace(/^\//, ""));
  // A route group — src/app/admin/(dashboard)/page.tsx — serves the parent path, so a missing
  // page.tsx directly in the folder is not proof the route is absent.
  if (existsSync(join(dir, "page.tsx")) || existsSync(`${dir}.tsx`)) return true;
  return readdirSync(dir, { withFileTypes: true })
    .some((e) => e.isDirectory() && e.name.startsWith("(") && existsSync(join(dir, e.name, "page.tsx")));
}
for (const i of items) check(`${i.href} is a real route`, routeExists(i.href));

// ---- the one that would have caught it -----------------------------------

/**
 * /platform is exempt by design: it is spread in only for platform admins, and linking it from
 * the settings page everyone sees would advertise the console's existence to every account.
 * Keep this exemption to exactly one href.
 */
const WIDE_EXEMPT = ["/platform"];
const wide = items.filter((i) => i.wide && !WIDE_EXEMPT.includes(i.href));
check("something is still marked wide", wide.length > 0, "if nothing is, delete the flag and this check");
for (const i of wide) {
  check(`${i.href} is hidden on a laptop, so the settings page must link it`,
    settings.includes(`"${i.href}"`),
    "no other way in: the installed app has no address bar");
}

// /platform is deliberately exempt: it is spread in conditionally for platform admins only and
// must not be advertised in the settings page everyone sees. Assert that exemption stays narrow.
check("/platform is the only wide item allowed to be unlinked",
  !settings.includes('"/platform"') && layout.includes("isPlatformAdminUser(user)"));
check("/platform is only in the nav for a platform admin",
  /isPlatformAdminUser\(user\)\s*\?\s*\[\{\s*href:\s*"\/platform"/.test(layout));

// ---- the mobile nav must not inherit the hiding --------------------------

// Both live in nav-links.tsx: the desktop bar honours `wide`, MobileNav must not.
const navLinks = read("src/components/admin/nav-links.tsx");
check("the desktop bar hides wide items below 2xl", navLinks.includes("hidden 2xl:inline-flex"));
const mobileFn = navLinks.slice(navLinks.indexOf("export function MobileNav"));
check("MobileNav exists in nav-links.tsx", mobileFn.length > 0);
check("the mobile nav ignores wide and shows every item", !/\bwide\b/.test(mobileFn),
  "a phone has no room problem and no address bar");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
