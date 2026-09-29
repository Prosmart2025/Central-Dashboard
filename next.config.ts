import type { NextConfig } from "next";

/**
 * `NEXT_STANDALONE=true` produces a self-contained server bundle (.next/standalone)
 * for Docker/VPS hosting. It stays opt-in so the managed preview build is unchanged.
 */
const nextConfig: NextConfig = {
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // Tuya credentials are server-side only; never let a proxy or tablet cache API replies.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
