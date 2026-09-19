import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@zhivago/shared"],
  devIndicators: false,
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
