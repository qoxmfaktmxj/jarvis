import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Disable worker in Node.js context
pdfjs.GlobalWorkerOptions.workerSrc = '';

export async function parsePdf(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false });
  const pdfDocument = await loadingTask.promise;

  const textParts: string[] = [];
  const numPages = pdfDocument.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter((item) => 'str' in item)
      .map((item) => (item as { str: string }).str)
      .join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n\n');
}
