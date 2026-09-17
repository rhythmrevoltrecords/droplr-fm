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
    // No full CSP here: public pages load Meta/TikTok/GA pixels from third-party hosts.
    const noFrame = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Logged-in and credential pages can't be framed (clickjacking).
      ...["/admin", "/admin/:path*", "/dashboard", "/dashboard/:path*", "/platform", "/platform/:path*", "/login", "/signup", "/forgot-password", "/reset-password"].map((source) => ({ source, headers: noFrame })),
    ];
  },
  serverExternalPackages: ["@prisma/client", "bcryptjs", "sharp", "@netlify/blobs"],
  // Share graphics read the Geist font files at runtime: make sure they ship with that route.
  outputFileTracingIncludes: {
    "/api/admin/releases/[id]/share": ["./node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf", "./node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf"],
  },
};
export default nextConfig;
