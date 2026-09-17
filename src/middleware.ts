import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isPlatformHost, platformSubdomain, SITE_URL } from "./lib/env";

const ANON_COOKIE = "dfm_anon";
// Whole path segments only, so a release slug like "iconic-dubplate" or "logo-riddim" still reaches the tenant rewrite.
const PASSTHROUGH = /^\/(api|_next|uploads|logo|host|r)(\/|$)|^\/(favicon\.ico|robots\.txt|icon|apple-icon)$/;
/**
 * droplr.fm's own pages on the platform host that never read x-anon-id / x-host: marketing, docs, auth,
 * the dashboards, static assets, and every API except the tracking / pre-save ones (/api/r, /api/b, /api/presave, /api/spotify, /api/deezer).
 * Anything else on the platform host is a public release, org or bio page (/{org}/{slug}, /b/*, /r/*) and still gets a visitor id.
 */
const PLATFORM_NO_VISITOR_ID =
  /^\/(?:$|(?:pricing|docs|legal|demo|login|signup|join|forgot-password|reset-password|invite|admin|dashboard|platform|logo|uploads|_next|opengraph-image|twitter-image|icon|apple-icon)(?:[/.]|$)|(?:favicon\.ico|robots\.txt|sitemap\.xml|manifest\.webmanifest)$|api\/(?!(?:r|b|presave|spotify|deezer)(?:\/|$)))/;

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";

  // 1) Auth guard (full role checks happen server-side)
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/platform")) {
    const token = req.cookies.get("dfm_session")?.value;
    let ok = false;
    if (token && process.env.JWT_SECRET) {
      try {
        await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ["HS256"], audience: "session" });
        ok = true;
      } catch {}
    }
    if (!ok) {
      // Build from the host the browser used, not req.nextUrl: on Netlify that can be the internal deploy
      // permalink (abc123…--droplr-fm.netlify.app), which Chrome flags as a lookalike and has no session cookie.
      const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      const base = !host || /^[0-9a-f]{20,}--/i.test(host) ? SITE_URL : `${proto}://${host}`;
      const login = new URL("/login", base);
      login.searchParams.set("next", url.pathname);
      return NextResponse.redirect(login);
    }
  }

  // 2) Platform marketing / app / static requests: no cookie, no header rewrite.
  const tenant = !isPlatformHost(host) || !!platformSubdomain(host);
  if (!tenant && PLATFORM_NO_VISITOR_ID.test(url.pathname)) return NextResponse.next();

  // 3) Anonymous visitor id — links view → click → pre-save
  let anonId = req.cookies.get(ANON_COOKIE)?.value;
  const newAnon = !anonId;
  if (!anonId) anonId = crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-anon-id", anonId);
  headers.set("x-host", host);

  // 4) Tenant hosts: presave.label.com/slug or label.droplr.fm/slug → /host/<host>/slug
  let res: NextResponse;
  if (tenant && !PASSTHROUGH.test(url.pathname) && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/dashboard") && !/^\/(login|forgot-password|reset-password)(\/|$)/.test(url.pathname)) {
    const rewritten = url.clone();
    rewritten.pathname = `/host/${encodeURIComponent(host.split(":")[0])}${url.pathname === "/" ? "" : url.pathname}`;
    res = NextResponse.rewrite(rewritten, { request: { headers } });
  } else {
    res = NextResponse.next({ request: { headers } });
  }

  if (newAnon) {
    res.cookies.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export const config = {
  // Skip build assets and static files. Anchored so release slugs like "iconic-dubplate" or "logo-riddim" still match on tenant hosts.
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$|logo/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|txt|xml|webmanifest|woff2?)$).*)"],
};
