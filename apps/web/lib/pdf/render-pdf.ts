import { renderToStaticMarkup } from "react-dom/server";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";

let cachedFontBase64: string | null = null;

export async function getFontFaceCss(): Promise<string> {
  if (cachedFontBase64 !== null) {
    return buildFontFaceCss(cachedFontBase64);
  }

  try {
    const fontPath = join(
      process.cwd(),
      "apps/web/public/fonts",
      "Pretendard-Regular.woff2",
    );
    const buffer = await fs.readFile(fontPath);
    cachedFontBase64 = buffer.toString("base64");
    return buildFontFaceCss(cachedFontBase64);
  } catch {
    // Font file missing — return empty so PDF still renders (with system fallback)
    cachedFontBase64 = "";
    return "";
  }
}

function buildFontFaceCss(base64: string): string {
  if (!base64) return "";
  return `@font-face {
    font-family: 'Pretendard';
    src: url(data:font/woff2;base64,${base64}) format('woff2');
    font-weight: 400;
    font-style: normal;
  }`;
}

export async function renderPdfFromReact(element: ReactElement): Promise<Buffer> {
  const markup = renderToStaticMarkup(element);
  const html = `<!doctype html>${markup}`;

  // Lazy import to avoid loading Playwright on module init
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    });
    return pdf as Buffer;
  } finally {
    await browser.close();
  }
}
