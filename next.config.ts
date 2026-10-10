import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2", "web-push"],
  experimental: {
    serverActions: { bodySizeLimit: "16mb" }, // recipe photos
    proxyClientMaxBodySize: "16mb",
    // Tabs are prefetched (static) and reused for 60 s; visited pages for 30 s. Saving anything clears it.
    staleTimes: { dynamic: 30, static: 60 },
  },
};

export default nextConfig;
