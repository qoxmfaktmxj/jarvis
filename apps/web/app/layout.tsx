import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { GridBackground } from "@/components/background/GridBackground";
import { UI_PREFS_BOOTSTRAP } from "@/components/layout/theme-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jarvis HR Evidence Wiki",
  description: "Evidence-grounded Korean HR compliance knowledge platform",
  icons: {
    icon: [{ url: "/capybara/basic.png", type: "image/png" }],
    apple: [{ url: "/capybara/basic.png", type: "image/png" }],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: UI_PREFS_BOOTSTRAP }} />
      </head>
      <body>
        <GridBackground />
        <div style={{ position: "relative", zIndex: 1 }}>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
