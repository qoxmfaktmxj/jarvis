const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Trigger a browser file download from binary bytes returned by a server action.
 *
 * Usage:
 *   const result = await exportCustomersToExcel(filters); // returns Uint8Array
 *   triggerDownload(result.bytes, result.filename);
 *
 * Default MIME is xlsx; override for other formats (e.g. "text/csv").
 */
export function triggerDownload(
  bytes: Uint8Array,
  filename: string,
  mime: string = XLSX_MIME,
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
