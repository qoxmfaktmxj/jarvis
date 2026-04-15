import type { AnalysisResult, ChatMessage, ExistingPage } from "../types.js";
import { MAX_EXISTING_PAGES, MAX_SOURCE_CHARS, PROMPT_VERSION, TRUNCATION_MARKER } from "../constants.js";
import { ALIASES_CONTRACT } from "./aliases-contract.js";

/**
 * Step B prompt — ported from reference_only/llm_wiki/src/lib/ingest.ts#buildGenerationPrompt.
 *
 * Differences from the original:
 *  - Jarvis multi-tenant paths: `auto/sources/`, `auto/entities/`,
 *    `auto/concepts/`, `auto/syntheses/`, plus `index.md` / `log.md`.
 *  - Frontmatter fields reflect WIKI-AGENTS.md §2 (sensitivity,
 *    requiredPermission, workspaceId, authority).
 *  - ALIASES_CONTRACT is inlined verbatim — a regression test asserts
 *    that the literal "ALIASES REQUIREMENT" substring is preserved.
 *  - `<user_content>…</user_content>` wrapper guards injections.
 *  - Consumes `AnalysisResult` (structured) instead of prose analysis.
 */

const SYSTEM_RULES = [
  "You are a wiki maintainer for an enterprise multi-tenant knowledge base.",
  "기존 위키는 한국어·영어 혼용이다. 각 페이지의 언어는 소스 언어를 따르고, 고유명사는 원문 표기를 유지한다.",
  "",
  "## Output Format (strict)",
  "",
  "Emit zero or more FILE blocks, then zero or more REVIEW blocks. Nothing else.",
  "",
  "```",
  "---FILE: auto/path/to/page.md---",
  "(complete file content with YAML frontmatter)",
  "---END FILE---",
  "```",
  "",
  "```",
  "---REVIEW: type | Title---",
  "Description of what needs human attention.",
  "OPTIONS: Create Page | Skip",
  "PAGES: auto/page1.md, auto/page2.md",
  "SEARCH: query 1 | query 2 | query 3",
  "---END REVIEW---",
  "```",
  "",
  "## Paths (Jarvis canonical layout)",
  "",
  "- `auto/sources/{slug}.md`    — 원본 소스 요약 (1건 필수 생성)",
  "- `auto/entities/{TitleCase}.md` — 인물·조직·시스템 엔티티",
  "- `auto/concepts/{kebab-case}.md` — 개념·정책·용어",
  "- `auto/syntheses/{slug}.md`  — 쿼리 합성 결과 (이 단계에서는 드물게)",
  "- `index.md`                   — 전체 카탈로그 (기존 항목 보존 + 추가)",
  "- `log.md`                     — append-only. 한 줄만 추가: `## [YYYY-MM-DD] ingest | {Title}`",
  "",
  "⚠️ `manual/**` 경로에는 절대 쓰지 말 것. 사람 편집 전용 영역이다.",
  "⚠️ `workspaceId` 하위 경로는 runtime 에서 prefix 로 붙는다. 출력은 항상 상대 경로.",
  "",
  "## Frontmatter (CRITICAL)",
  "",
  "```yaml",
  "---",
  "title: \"페이지 제목\"",
  "type: source | entity | concept | synthesis | derived",
  "workspaceId: \"{RUNTIME_INJECTED}\"  # 런타임에서 주입; LLM은 placeholder 그대로 둔다",
  "sensitivity: PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY",
  "requiredPermission: \"knowledge:read\"",
  "sources: [\"<raw_source_id_or_filename>\"]",
  "aliases: [\"동의어1\", \"동의어2\", \"동의어3\"]",
  "tags: [\"domain/hr\", \"type/policy\"]",
  "created: YYYY-MM-DD",
  "updated: YYYY-MM-DD",
  "authority: auto",
  "linkedPages: [\"slug-1\", \"slug-2\"]",
  "---",
  "```",
  "",
  ALIASES_CONTRACT,
  "",
  "## Body Rules",
  "",
  "- Cross-reference with `[[wikilink]]` syntax. Target must exist in Current Wiki Index OR be simultaneously created in this response.",
  "- Use kebab-case for concept filenames, TitleCase for entity filenames.",
  "- Preserve every existing `index.md` entry; you may only ADD.",
  "- Keep each page focused: one entity or one concept per file.",
  "- 본문은 소스 언어를 따르되 관리자가 읽을 수 있도록 간결하게.",
  "",
  "## REVIEW block types",
  "",
  "- `contradiction` — analysis가 기존 페이지와 충돌 주장을 발견.",
  "- `duplicate`     — index에 유사 엔티티가 이미 존재할 가능성.",
  "- `missing-page`  — 중요한 개념이 참조됐지만 전용 페이지 없음.",
  "- `suggestion`    — 추가 조사가 가치 있음 (웹 검색 후보 포함).",
  "- `sensitivity`   — PII/보안 상승이 필요해 보임.",
  "",
  "OPTIONS는 오직 `Create Page | Skip` 조합만 사용한다. custom 라벨 금지.",
  "SEARCH 라인은 `suggestion` / `missing-page` 에 대해 2~3개의 검색 질의를 파이프(`|`)로 구분. 문장이 아닌 키워드 형태.",
  "",
  "사소한 검토 항목은 생성하지 않는다 — 사람 판단이 실제로 필요한 것만.",
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
  return [
    "## Current Wiki Index (preserve all, add only)",
    `(${capped.length}/${existingPages.length} pages shown — truncated to top ${MAX_EXISTING_PAGES} by caller)`,
    ...rows,
  ].join("\n");
}

function truncateSource(source: string): string {
  if (source.length <= MAX_SOURCE_CHARS) return source;
  return source.slice(0, MAX_SOURCE_CHARS) + TRUNCATION_MARKER;
}

function stringifyAnalysis(analysis: AnalysisResult): string {
  // Deterministic pretty JSON — Step B parses this visually, not programmatically,
  // so the indentation matters for LLM token economy.
  return JSON.stringify(analysis, null, 2);
}

export interface BuildGenerationPromptInput {
  analysis: AnalysisResult;
  source: string;
  existingPages: ExistingPage[];
  sourceFileName?: string;
  folderContext?: string;
}

/**
 * Build the Step B (Generation) chat messages.
 *
 * Output: `[system, user]`. The system message is deterministic
 * given the existing-page index; the user message wraps raw source
 * in `<user_content>` and supplies the JSON analysis produced by
 * Step A.
 */
export function buildGenerationPrompt(input: BuildGenerationPromptInput): ChatMessage[] {
  const { analysis, source, existingPages, sourceFileName, folderContext } = input;

  const system = [
    `// prompt_version: ${PROMPT_VERSION} // step: generation`,
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
    "Generate wiki FILE blocks and REVIEW blocks based on the Step-A analysis and the raw source below.",
    "Produce multi-page output — a single ingest must update related pages, not only create one.",
    "",
    fileHeader + folderLine,
    "",
    "## Step-A Analysis (structured)",
    "```json",
    stringifyAnalysis(analysis),
    "```",
    "",
    "## Raw Source",
    "<user_content>",
    truncateSource(source),
    "</user_content>",
    "",
    "Emit ONLY FILE and REVIEW blocks. No prose outside blocks. No code fences around block headers.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
