import {
  buildGenerationPrompt,
  generationOutputSchema,
  parseFileBlocks,
  parseReviewBlocks,
  type AnalysisResult,
  type ExistingPage,
  type GenerationOutput,
} from "@jarvis/wiki-agent";
import type { WikiCompletionClient } from "./analyze.js";

export async function generatePages(
  input: {
    sourceRevisionId: string;
    sourceTitle: string;
    effectiveDate: string | null;
    normalizedText: string;
    existingPages: ExistingPage[];
    analysis: AnalysisResult;
  },
  model: WikiCompletionClient,
): Promise<GenerationOutput> {
  const messages = buildGenerationPrompt({
    sourceRevisionId: input.sourceRevisionId,
    sourceTitle: input.sourceTitle,
    effectiveDate: input.effectiveDate,
    source: input.normalizedText,
    existingPages: input.existingPages,
    analysis: input.analysis,
  });
  const raw = await model.complete({
    purpose: "wiki-generate",
    messages,
    sourceRevisionId: input.sourceRevisionId,
    sourceTitle: input.sourceTitle,
    effectiveDate: input.effectiveDate,
  });
  const files = parseFileBlocks(raw);
  if ((raw.match(/---FILE:/g) ?? []).length !== files.length) {
    throw new Error("one or more generated FILE paths were rejected");
  }
  return generationOutputSchema.parse({
    files,
    reviews: parseReviewBlocks(raw),
  });
}
