import type { AskAgentDeps, SourceReadResult } from "../../types.js";
import { assertToolAccess } from "./types.js";

export function locateSourceSegment(text: string, locator: string): string | null {
  if (locator === "document") {
    const value = text.trim();
    return value ? value.slice(0, 800) : null;
  }
  if (/^paragraph:\d+$/.test(locator)) {
    const index = Number(locator.split(":")[1]) - 1;
    if (!Number.isSafeInteger(index) || index < 0) return null;
    const paragraphs = text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    const value = paragraphs[index];
    return value ? value.slice(0, 800) : null;
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
    const value = text
      .split("\n")
      .slice(start - 1, end)
      .join("\n")
      .trim();
    return value ? value.slice(0, 800) : null;
  }
  if (/^[\p{L}\p{N}][\p{L}\p{N}\s()·.,-]{0,119}$/u.test(locator)) {
    const value = text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .find((part) => part.includes(locator));
    return value ? value.slice(0, 800) : null;
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
