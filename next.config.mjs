/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // next/image is only used for local logo files (release covers use plain <img> with remote URLs),
  // so optimisation stays on: the 2736px wordmark is resized per device instead of shipping 378KB.
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "node-vibrant", "@netlify/blobs"],
  },
};
export default nextConfig;
