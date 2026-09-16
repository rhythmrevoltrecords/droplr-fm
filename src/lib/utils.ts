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
  "legal", "terms", "privacy", "refunds", "cookies", "billing",
  "forgot-password", "reset-password", "platform", "account", "support", "copyright",
  // Look like official droplr.fm pages / subdomains: phishing bait if a label could claim them.
  "www", "mail", "email", "accounts", "app", "status", "help", "blog", "cdn", "static", "assets",
]);
