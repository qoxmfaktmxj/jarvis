import type { AskAgentDeps, SourceReadResult } from "../../types.js";
import { assertToolAccess } from "./types.js";

const SOURCE_EXCERPT_MAX_CHARS = 2_000;

function focusedExcerpt(text: string, focusStart: number, focusEnd: number): string {
  if (text.length <= SOURCE_EXCERPT_MAX_CHARS) return text;
  const focusLength = Math.max(0, focusEnd - focusStart);
  const surrounding = Math.max(0, SOURCE_EXCERPT_MAX_CHARS - focusLength);
  const start = Math.max(
    0,
    Math.min(focusStart - Math.floor(surrounding / 2), text.length - SOURCE_EXCERPT_MAX_CHARS),
  );
  return text.slice(start, start + SOURCE_EXCERPT_MAX_CHARS).trim();
}

function paragraphExcerpt(paragraphs: readonly string[], index: number): string | null {
  const selected = paragraphs[index];
  if (!selected) return null;
  const before = paragraphs[index - 1] ? `${paragraphs[index - 1]}\n\n` : "";
  const after = paragraphs[index + 1] ? `\n\n${paragraphs[index + 1]}` : "";
  return focusedExcerpt(`${before}${selected}${after}`, before.length, before.length + selected.length);
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function locateSourceSegment(text: string, locator: string): string | null {
  if (locator === "document") {
    const value = text.trim();
    return value ? value.slice(0, SOURCE_EXCERPT_MAX_CHARS) : null;
  }
  if (/^paragraph:\d+$/.test(locator)) {
    const index = Number(locator.split(":")[1]) - 1;
    if (!Number.isSafeInteger(index) || index < 0) return null;
    return paragraphExcerpt(paragraphsOf(text), index);
  }
  if (/^line:\d+-\d+$/.test(locator)) {
    const [start, end] = locator
      .slice(5)
      .split("-")
      .map((value) => Number(value));
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end - start > 19
    ) {
      return null;
    }
    const lines = text.split("\n");
    const contextStart = Math.max(0, start - 11);
    const contextEnd = Math.min(lines.length, end + 10);
    const value = lines.slice(contextStart, contextEnd).join("\n").trim();
    const before = lines.slice(contextStart, start - 1).join("\n");
    const focusStart = before.length + (before ? 1 : 0);
    const focusEnd = focusStart + lines.slice(start - 1, end).join("\n").length;
    return value ? focusedExcerpt(value, focusStart, focusEnd) : null;
  }
  if (/^[\p{L}\p{N}][\p{L}\p{N}\s()·.,-]{0,119}$/u.test(locator)) {
    const paragraphs = paragraphsOf(text);
    const index = paragraphs.findIndex((part) => part.includes(locator));
    return index >= 0 ? paragraphExcerpt(paragraphs, index) : null;
  }
  return null;
}

export async function sourceRead(
  deps: Pick<AskAgentDeps, "context" | "sourceRevisionRepository" | "objectStore" | "locateSourceSegment">,
  input: { source_revision_id: string; locator: string },
): Promise<SourceReadResult> {
  assertToolAccess(deps.context, "source_read");
  const revision = await deps.sourceRevisionRepository.findReadableRevision({
    workspaceId: deps.context.workspaceId,
    sourceRevisionId: String(input.source_revision_id ?? ""),
  });
  if (!revision) throw new Error("SOURCE_REVISION_NOT_FOUND");
  const normalized = await deps.objectStore.getText(revision.normalizedObjectKey);
  const text = deps.locateSourceSegment(normalized, String(input.locator ?? ""));
  if (!text) throw new Error("LOCATOR_NOT_FOUND");
  return {
    sourceRevisionId: revision.id,
    locator: String(input.locator ?? ""),
    effectiveFrom: revision.effectiveFrom,
    text,
  };
}
