/**
 * Step B — Generation LLM call for the W2 wiki two-step ingest pipeline.
 *
 * Input  : Step A `AnalysisResult` + same source text + existing pages
 * Output : { fileBlocks, reviewBlocks } plus an injected workspace context
 *          so Step C can substitute `{RUNTIME_INJECTED}` placeholders in
 *          generated frontmatter without re-walking the markdown.
 *
 * The Generation prompt is contractually obligated to emit FILE blocks for
 * BOTH new and updated pages — the W2 DoD requires ≥8 page updates per
 * ingest. We do not enforce this count here (the validate step decides what
 * to do); but we surface the produced count in `pageCount` so callers can
 * route low-output runs to ingest_dlq.
 */

import OpenAI from "openai";

import {
  buildGenerationPrompt,
  parseFileBlocks,
  parseReviewBlocks,
  type AnalysisResult,
  type ExistingPage,
  type FileBlock,
  type ReviewBlock,
} from "@jarvis/wiki-agent";

const INGEST_MODEL = process.env["INGEST_AI_MODEL"] ?? "gpt-5.4-mini";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
  }
  return _openai;
}

export interface GenerateInput {
  rawSourceId: string;
  workspaceId: string;
  safeText: string;
  analysis: AnalysisResult;
  existingPages: ExistingPage[];
  sourceFileName?: string;
  folderContext?: string;
}

export interface GenerateOutput {
  fileBlocks: FileBlock[];
  reviewBlocks: ReviewBlock[];
  /** Total of new + updated pages (excluding log.md/index.md special files). */
  pageCount: number;
  /** Raw LLM text — kept for ingest_dlq payload when validate fails. */
  rawText: string;
}

/**
 * Special wiki paths that aren't counted toward the W2 ≥8 page-update DoD.
 * `index.md` and `log.md` are bookkeeping, not content.
 */
function isBookkeepingPath(p: string): boolean {
  return p === "index.md" || p === "log.md" || p.endsWith("/index.md") || p.endsWith("/log.md");
}

export async function generate(input: GenerateInput): Promise<GenerateOutput> {
  const promptInput: Parameters<typeof buildGenerationPrompt>[0] = {
    analysis: input.analysis,
    source: input.safeText,
    existingPages: input.existingPages,
  };
  if (input.sourceFileName !== undefined) promptInput.sourceFileName = input.sourceFileName;
  if (input.folderContext !== undefined) promptInput.folderContext = input.folderContext;
  const messages = buildGenerationPrompt(promptInput);

  const openai = getOpenAI();
  const resp = await openai.chat.completions.create({
    model: INGEST_MODEL,
    temperature: 0,
    messages,
  });

  const rawText = resp.choices[0]?.message?.content ?? "";
  const fileBlocks = parseFileBlocks(rawText);
  const reviewBlocks = parseReviewBlocks(rawText);

  const pageCount = fileBlocks.filter((b) => !isBookkeepingPath(b.path)).length;

  return { fileBlocks, reviewBlocks, pageCount, rawText };
}
