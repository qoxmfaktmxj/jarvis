import type { Metadata } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AxeInit } from "@/lib/a11y/axe-init";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
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
  description: "Enterprise Internal Portal",
  icons: {
    icon: "/capybara/basic.png",
    apple: "/capybara/basic.png",
  },
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  // Read the nonce that middleware injected via x-csp-nonce request header.
  // Required for 'strict-dynamic': browsers only trust scripts whose nonce
  // matches the CSP nonce. Next.js 15 needs the nonce on <html> so its
  // bootstrap scripts are trusted.
  // See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
  const nonce = (await headers()).get("x-csp-nonce") ?? "";
  return (
    <html lang="ko" suppressHydrationWarning nonce={nonce}>
      <head>
        {/* No-flash sidebar/theme sync — set data-sidebar/data-theme from localStorage
            BEFORE React hydrates so CSS variables (--sidebar-width, etc.) match the
            React state on first paint. Without this, the CSS default (rail/light)
            mismatches React's DEFAULT (expanded/light) and causes layout flash. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('jv.sidebar');var t=localStorage.getItem('jv.theme');document.documentElement.setAttribute('data-sidebar',s==='rail'?'rail':'expanded');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`,
          }}
        />
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
            <Toaster />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
