export type LogEventType = "ingest" | "projection" | "lint" | "review";

export interface LogEntry {
  date: Date;
  type: LogEventType;
  summary: string;
  details?: string[];
}

const LOG_FILE_HEADER = [
  "# Public Jarvis Wiki Log",
  "",
  "Append-only timeline of wiki upkeep events.",
  "",
  "",
].join("\n");

function formatDateUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLogEntry(entry: LogEntry): string {
  const header = `## [${formatDateUtc(entry.date)}] ${entry.type} | ${entry.summary}`;
  if (!entry.details || entry.details.length === 0) return `${header}\n\n`;
  return `${header}\n${entry.details.map((detail) => `- ${detail}`).join("\n")}\n\n`;
}

export function appendLogEntry(existing: string, entry: LogEntry): string {
  const prefix = existing.trim().length === 0 ? LOG_FILE_HEADER : existing.endsWith("\n") ? existing : `${existing}\n`;
  return prefix + formatLogEntry(entry);
}
