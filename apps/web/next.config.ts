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
  // Sentry (and its import-in-the-middle hook) is Node-only. Keep it
  // external so webpack never tries to bundle worker_threads/module for
  // the browser or edge bundles. Pair with the NEXT_RUNTIME guard in
  // instrumentation.ts.
  serverExternalPackages: [
    "@sentry/node",
    "@sentry/node-core",
    "import-in-the-middle",
    "require-in-the-middle"
  ],
  // T6: forbidden()/unauthorized() API 활성화 (Next.js 15.1+ experimental).
  // wiki viewer 403 응답을 200+content 대신 HTTP 403 으로 분기하기 위함.
  experimental: {
    authInterrupts: true,
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

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(nextConfig);
