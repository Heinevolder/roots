import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  experimental: {
    serverActions: { bodySizeLimit: "16mb" }, // recipe photos
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;
