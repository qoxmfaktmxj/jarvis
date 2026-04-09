import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  distDir: isDev ? ".next-dev" : ".next",
  // standalone output for Docker production builds (Linux only)
  // Disabled on Windows due to symlink permission limitations (EPERM)
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
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
      { protocol: 'http', hostname: 'minio' },
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
