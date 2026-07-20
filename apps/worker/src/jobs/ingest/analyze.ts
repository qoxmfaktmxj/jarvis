import {
  analysisResultSchema,
  buildAnalysisPrompt,
  type AnalysisResult,
  type ChatMessage,
  type ExistingPage,
} from "@jarvis/wiki-agent";

export interface WikiCompletionClient {
  complete(input: {
    purpose: "wiki-analyze" | "wiki-generate";
    messages: ChatMessage[];
    sourceRevisionId: string;
    sourceTitle: string;
    effectiveDate: string | null;
  }): Promise<string>;
}

export async function analyzeRevision(
  input: {
    sourceRevisionId: string;
    sourceTitle: string;
    effectiveDate: string | null;
    normalizedText: string;
    existingPages: ExistingPage[];
  },
  model: WikiCompletionClient,
): Promise<AnalysisResult> {
  const messages = buildAnalysisPrompt({
    sourceRevisionId: input.sourceRevisionId,
    sourceTitle: input.sourceTitle,
    effectiveDate: input.effectiveDate,
    source: input.normalizedText,
    existingPages: input.existingPages,
  });
  const raw = await model.complete({
    purpose: "wiki-analyze",
    messages,
    sourceRevisionId: input.sourceRevisionId,
    sourceTitle: input.sourceTitle,
    effectiveDate: input.effectiveDate,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("wiki analysis returned invalid JSON");
  }
  return analysisResultSchema.parse(parsed);
}
