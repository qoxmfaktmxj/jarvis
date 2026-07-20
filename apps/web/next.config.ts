import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["pg"],
  transpilePackages: [
    "@jarvis/ai",
    "@jarvis/auth",
    "@jarvis/db",
    "@jarvis/search",
    "@jarvis/shared",
    "@jarvis/storage",
    "@jarvis/wiki-agent",
    "@jarvis/wiki-fs",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-dialog"],
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
