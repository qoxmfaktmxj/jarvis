import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

export async function renderPdfFromReact(element: ReactElement): Promise<Buffer> {
  const html = `<!doctype html>${renderToStaticMarkup(element)}`;

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
