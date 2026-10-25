/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // next/image is only used for local logo files (release covers use plain <img> with remote URLs),
  // so optimisation stays on: the 2736px wordmark is resized per device instead of shipping 378KB.
  // AVIF dropped: the AVIF encode path in Next 14's image optimizer is a DoS risk (fixed upstream in a later major).
  images: { formats: ["image/webp"] },
  // Short legal URLs people type or paste into Stripe / app stores.
  async redirects() {
    return [
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
    ];
  },
  async headers() {
    // Where a page may load things from. 'unsafe-inline' stays for scripts: Next's own bootstrap and
    // the pixel snippets are inline, and nonces would force every page to render per request. So this
    // policy limits the HOSTS scripts, frames and connections can come from — a pasted id or a
    // tampered row can't pull in a script from anywhere else — rather than stopping inline script.
    // Images are any https host: release covers and icons are labels' own remote URLs.
    // Adding a third-party embed or pixel means adding its host here; test:csp loads every page type
    // in a browser and fails on any violation.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://analytics.tiktok.com https://*.tiktok.com https://www.googletagmanager.com https://*.google-analytics.com",
      "connect-src 'self' https://*.facebook.com https://*.facebook.net https://*.tiktok.com https://*.tiktokw.us https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.g.doubleclick.net https://*.google.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "frame-src https://www.youtube-nocookie.com https://w.soundcloud.com https://*.facebook.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      // Any https destination: a browser applies form-action to the redirect after a submit too, and
      // the pre-save buttons are form submits that 303 to Spotify's or Deezer's sign-in (and from
      // there wherever a label's own store link points). test:csp submits one and checks it leaves.
      "form-action 'self' https:",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      // Not on the two image routes: they send their own, stricter policy (sandbox, nothing loads),
      // and a header set here replaces the one a route sets rather than adding to it.
      { source: "/((?!api/cover/|api/admin/releases/[^/]+/cover).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
      // Service worker: always fresh, allowed to control the whole site (dashboards live under /admin, /dashboard, /platform).
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      { source: "/app/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
      // No page can be framed (clickjacking): X-Frame-Options above, frame-ancestors in the policy.
    ];
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp", "@netlify/blobs", "web-push"],
  // Share graphics read the Geist font files at runtime: make sure they ship with that route.
  outputFileTracingIncludes: {
    "/api/admin/releases/[id]/share": ["./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf", "./node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf"],
  },
};
export default nextConfig;
