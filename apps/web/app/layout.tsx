import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AxeInit } from "@/lib/a11y/axe-init";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/**
 * Typography — Pretendard Variable (UI/body, Korean-optimized) + JetBrains Mono
 * (code, IDs, timestamps). Pretendard is served via CDN to avoid Google Fonts
 * subsetting issues with Korean.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Jarvis",
  description: "Enterprise Internal Portal"
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body
        className={`${jetbrainsMono.variable} font-sans antialiased`}
        style={{ fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, sans-serif" }}
      >
        <NextIntlClientProvider messages={messages}>
          <TooltipProvider delayDuration={200}>
            <AxeInit />
            {children}
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
