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
  "host", "invite", "settings", "b", "_next", "favicon.ico", "robots.txt", "sitemap.xml",
]);
