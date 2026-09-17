import { NextResponse } from "next/server";

/**
 * Same-site redirect with a RELATIVE Location header.
 * `new URL(path, req.url)` looks harmless, but on Netlify req.url can carry the deploy's internal host
 * (e.g. 6aab…--droplr-fm.netlify.app), which dropped people onto a URL Chrome flags as a lookalike, with no
 * session cookie there. A relative Location resolves against whatever host the browser is actually on:
 * droplr.fm, or a label's custom domain.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 303) {
  // Only local paths: "//host" and "/\host" are both off-site in browsers.
  const safe = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
  return new NextResponse(null, { status, headers: { Location: safe } });
}
