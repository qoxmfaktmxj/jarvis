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
    // Barrel imports tree-shake — lucide-react/radix는 dev에서도 페이지마다
    // re-resolve 비용이 커서 컴파일 시간을 눈에 띄게 줄임.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-select",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-tabs",
    ],
  },
  // Turbopack 설정. pnpm dev (--turbopack) 사용 시 활성화.
  // webpack 폴백 (pnpm dev:webpack) 사용 시 아래 webpack(...) 콜백이 대신 적용됨.
  turbopack: {
    resolveExtensions: [
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".mts",
      ".mjs",
      ".cts",
      ".cjs",
      ".json",
    ],
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
