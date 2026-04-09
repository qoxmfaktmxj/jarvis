import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  distDir: isDev ? ".next-dev" : ".next",
  // Next 15.5 compares allowedDevOrigins against the request hostname, not the full origin URL.
  allowedDevOrigins: [
    "127.0.0.1"
  ],
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

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(nextConfig);
