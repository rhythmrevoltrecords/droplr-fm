import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isPlatformHost, platformSubdomain } from "./lib/env";

const ANON_COOKIE = "dfm_anon";
const PASSTHROUGH = /^\/(api|_next|uploads|logo|host|favicon\.ico|robots\.txt|icon|apple-icon)/;

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";

  // 1) Anonymous visitor id — links view → click → pre-save
  let anonId = req.cookies.get(ANON_COOKIE)?.value;
  const newAnon = !anonId;
  if (!anonId) anonId = crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-anon-id", anonId);
  headers.set("x-host", host);

  // 2) Auth guard (full role checks happen server-side)
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/dashboard")) {
    const token = req.cookies.get("dfm_session")?.value;
    let ok = false;
    if (token && process.env.JWT_SECRET) {
      try {
        await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
        ok = true;
      } catch {}
    }
    if (!ok) {
      const login = new URL("/login", url);
      login.searchParams.set("next", url.pathname);
      return NextResponse.redirect(login);
    }
  }

  // 3) Tenant hosts: presave.label.com/slug or label.droplr.fm/slug → /host/<host>/slug
  let res: NextResponse;
  const tenant = !isPlatformHost(host) || !!platformSubdomain(host);
  if (tenant && !PASSTHROUGH.test(url.pathname) && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/dashboard") && !url.pathname.startsWith("/login")) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
