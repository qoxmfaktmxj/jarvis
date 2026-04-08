import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    "@jarvis/db",
    "@jarvis/shared",
    "@jarvis/auth",
    "@jarvis/search",
    "@jarvis/ai",
    "@jarvis/secret"
  ],
  experimental: {
    typedRoutes: true,
  },
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
