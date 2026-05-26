import type { NextConfig } from "next";

// next-pwa uses Webpack plugins incompatible with Next.js 16 Turbopack.
// PWA is served via public/manifest.json + meta tags in layout.tsx.
// Wire up a service worker separately when needed (e.g. Workbox CLI).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
};

export default nextConfig;
