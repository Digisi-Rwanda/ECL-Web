import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    optimizePackageImports: ["framer-motion", "gsap", "radix-ui", "lucide-react"],
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  async redirects() {
    return [
      { source: "/runs/:path*", destination: "/ecl/runs/:path*", permanent: true },
      { source: "/runs", destination: "/ecl/runs", permanent: true },
      { source: "/results", destination: "/ecl/results", permanent: true },
      { source: "/ecl", destination: "/ecl/runs", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return [];
    const base = backendUrl.replace(/\/$/, "");
    return [
      {
        source: "/api/v1/:path*",
        destination: `${base}/api/v1/:path*`,
      },
      {
        source: "/ready",
        destination: `${base}/ready`,
      },
      {
        source: "/health",
        destination: `${base}/health`,
      },
    ];
  },
};

export default nextConfig;
