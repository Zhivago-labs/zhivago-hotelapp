import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@zhivago/shared"],
  devIndicators: false,
  // 10 photos × 20 MB plus multipart fields; matches the existing API image limits.
  experimental: { serverActions: { bodySizeLimit: "210mb" } },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
