import type { ChatMessage, ExistingPage } from "../types.js";
import { MAX_EXISTING_PAGES, MAX_SOURCE_CHARS, PROMPT_VERSION, TRUNCATION_MARKER } from "../constants.js";

/**
 * Step A prompt — ported from reference_only/llm_wiki/src/lib/ingest.ts#buildAnalysisPrompt.
 *
 * Differences from the original:
 *  - Adapted for Jarvis's Korean-English mixed enterprise knowledge base.
 *  - Emits a strict JSON schema (keyEntities/keyConcepts/findings/contradictions/recommendations)
 *    rather than prose markdown, because Step B consumes it programmatically.
 *  - `<user_content>…</user_content>` wrapper guards against prompt-injection
 *    hidden in raw source text (99-integration-plan-v4 §4.1 W1-T2 DoD).
 *  - `existingPages` is capped at MAX_EXISTING_PAGES before being rendered.
 */

const SYSTEM_RULES = [
  "You are an expert research analyst for an enterprise wiki maintained by a multi-tenant SaaS.",
  "기존 위키는 한국어·영어 혼용 엔터프라이즈 지식이다. 답변은 **반드시 유효한 JSON만** 반환하라 — prose, markdown, code fence 금지.",
  "Your analysis MUST strictly follow the JSON schema below. Unknown fields are rejected.",
  "",
  "## Language Rule",
  "- Source 언어가 한국어면 요약·리스트도 한국어로 작성한다.",
  "- Source가 영문이면 영문으로 작성한다.",
  "- Source가 혼용이면 원문의 주 언어를 따르되, 고유명사는 원문 그대로 유지한다.",
  "",
  "## JSON Schema (strict)",
  "```json",
  "{",
  '  "keyEntities": [{"name": string, "type": string, "aliases": string[]}],',
  '  "keyConcepts": [{"name": string, "summary": string, "relatedPageIds": string[]}],',
  '  "findings":    [string],',
  '  "contradictions": [{"pageA": string, "pageB": string, "description": string}],',
  '  "recommendations": [string]',
  "}",
  "```",
  "",
  "Field contracts:",
  "- `keyEntities[].type`: person | organization | system | product | dataset | tool | policy | other",
  "- `keyEntities[].aliases`: 최소 1개(있으면) — 한국어·영문·축약어 혼재 가능.",
  "- `keyConcepts[].summary`: 2~3문장, ≤ 280 chars.",
  "- `keyConcepts[].relatedPageIds`: existing index에서 실제로 존재하는 path만 (예: \"auto/concepts/휴가-정책.md\"). 추측 금지.",
  "- `contradictions[].pageA` / `pageB`: 마찬가지로 실존 path. 둘 중 하나가 신규라면 `__new__` 플레이스홀더 사용.",
  "- 모든 문자열은 JSON 이스케이프 규칙 준수. 개행은 `\\n`.",
  "",
  "If a folder context is provided, treat it as a categorization hint (예: 'papers/energy').",
  "Focus on what is genuinely important — be thorough but concise.",
].join("\n");

function renderExistingPages(existingPages: ExistingPage[]): string {
  if (existingPages.length === 0) {
    return "## Current Wiki Index\n(비어 있음 — 첫 ingest이거나 관련 페이지 없음)";
  }
  const capped = existingPages.slice(0, MAX_EXISTING_PAGES);
  const rows = capped.map((p) => {
    const summary = (p.summary ?? "").trim();
    const suffix = summary.length > 0 ? ` — ${summary}` : "";
    return `- ${p.path} :: ${p.title}${suffix}`;
  });
  const header = [
    "## Current Wiki Index",
    `(${capped.length}/${existingPages.length} pages shown — truncated to top ${MAX_EXISTING_PAGES} by caller)`,
  ].join("\n");
  return `${header}\n${rows.join("\n")}`;
}

function truncateSource(source: string): string {
  if (source.length <= MAX_SOURCE_CHARS) return source;
  return source.slice(0, MAX_SOURCE_CHARS) + TRUNCATION_MARKER;
}

export interface BuildAnalysisPromptInput {
  /** Raw source text (pre-truncation). */
  source: string;
  /** Shortlisted existing wiki pages (caller-truncated to ≤ 15). */
  existingPages: ExistingPage[];
  /** Optional folder context from upload hierarchy (e.g. "policies/hr"). */
  folderContext?: string;
  /** Human-readable source filename for provenance logs. */
  sourceFileName?: string;
}

/**
 * Build the Step A (Analysis) chat messages.
 *
 * Output: `[system, user]`. The `system` message is deterministic
 * given the schema + existing pages; the `user` message wraps raw
 * source in `<user_content>` to defeat prompt injection.
 */
export function buildAnalysisPrompt(input: BuildAnalysisPromptInput): ChatMessage[] {
  const { source, existingPages, folderContext, sourceFileName } = input;

  const system = [
    `// prompt_version: ${PROMPT_VERSION} // step: analysis`,
    "",
    SYSTEM_RULES,
    "",
    renderExistingPages(existingPages),
  ].join("\n");

  const fileHeader = sourceFileName
    ? `**File:** ${sourceFileName}`
    : "**File:** (unnamed source)";
  const folderLine = folderContext ? `\n**Folder context:** ${folderContext}` : "";

  const user = [
    "Analyze this source document and return JSON matching the schema defined above.",
    "",
    fileHeader + folderLine,
    "",
    "<user_content>",
    truncateSource(source),
    "</user_content>",
    "",
    "Return JSON only. No code fence. No explanatory prose.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
