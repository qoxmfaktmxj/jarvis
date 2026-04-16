import type { Metadata } from "next";
import { Familjen_Grotesk, Hahmlet } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "./globals.css";

/**
 * Font pairing — "instrument panel / precision readout":
 * - Familjen Grotesk (display): Swedish governmental grotesk with engineered
 *   character, narrow apertures, and an unusual single-story `g`. Structured
 *   and precise without being another humanist default.
 * - Hahmlet (body): Korean variable serif by the Wanted Sans designer.
 *   Mechanical, calibrated feel with proper Korean support — deliberately
 *   counter to the Noto/Pretendard monoculture, evoking a technical manual.
 */
const familjenGrotesk = Familjen_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const hahmlet = Hahmlet({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
      <body
        className={`${familjenGrotesk.variable} ${hahmlet.variable} font-sans`}
        style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
