import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function pct(n: number, d: number) {
  if (!d) return "0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export function fmtNum(n: number) {
  return new Intl.NumberFormat("en-AU").format(n);
}

export const RESERVED_SLUGS = new Set([
  "admin", "dashboard", "api", "login", "logout", "signup", "pricing", "docs", "demo",
  "host", "invite", "settings", "b", "r", "_next", "favicon.ico", "robots.txt", "sitemap.xml",
  "learn", "legal", "terms", "privacy", "refunds", "cookies", "billing",
  "forgot-password", "reset-password", "platform", "account", "support", "copyright", "join", "feedback", "referrals", "platforms", "app", "sw.js",
  // Look like official droplr.fm pages / subdomains: phishing bait if a label could claim them.
  "www", "mail", "email", "accounts", "app", "status", "help", "blog", "cdn", "static", "assets",
]);

/** "3 days ago" for server-rendered labels (rendered once on the server, so no hydration drift). */
export function timeAgo(d: Date, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.round(h / 24);
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
