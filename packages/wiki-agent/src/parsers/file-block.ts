import type { FileBlock } from "../types.js";

const FILE_BLOCK_REGEX =
  /---FILE:[ \t]*([^\n]+?)[ \t]*---\r?\n([\s\S]*?)\r?\n---END FILE---/g;

const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

function isReservedSegment(segment: string): boolean {
  const [stem] = segment.split(".");
  return RESERVED_WINDOWS_NAMES.has(stem.toUpperCase());
}

function isAllowedGeneratedPath(value: string): boolean {
  if (!value || value.normalize("NFC") !== value) return false;
  if (value.includes("\0") || value.includes("\\") || value.startsWith("/")) return false;
  if (value.startsWith("//") || /^[A-Za-z]:/.test(value)) return false;
  if (!value.endsWith(".md") || !value.startsWith("auto/")) return false;
  if (/[*?"<>|]/.test(value)) return false;
  const segments = value.split("/");
  if (segments.length < 3) return false;
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  if (segments.some(isReservedSegment)) return false;
  const rootName = segments.at(-1);
  if (rootName === "index.md" || rootName === "log.md") return false;
  return true;
}

export function parseFileBlocks(text: string): FileBlock[] {
  if (!text) return [];
  return Array.from(text.matchAll(FILE_BLOCK_REGEX), (match) => ({
    path: match[1]?.trim() ?? "",
    content: match[2] ?? "",
    mode: "overwrite" as const,
  })).filter((block) => isAllowedGeneratedPath(block.path));
}
