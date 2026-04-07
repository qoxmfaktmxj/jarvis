import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@jarvis/db",
    "@jarvis/shared",
    "@jarvis/auth",
    "@jarvis/search",
    "@jarvis/ai",
    "@jarvis/secret"
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        pathname: "/**"
      }
    ]
  }
};

export default nextConfig;
