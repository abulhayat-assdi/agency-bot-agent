import type { NextConfig } from "next";

import { securityHeadersForEnvironment } from "./src/server/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeadersForEnvironment()
      }
    ];
  }
};

export default nextConfig;
