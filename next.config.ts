import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Croki and local browser QA reach the dev server through this loopback host.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
