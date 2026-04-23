// packages/wiki-agent/src/append-log.ts
//
// Phase C2 — wiki/log.md append-only timeline (Karpathy LLM Wiki §logging).
//
// 규약:
//   - 매 entry 는 `## [YYYY-MM-DD] <type> | <summary>` 헤더로 시작 (UTC 날짜)
//   - 헤더 뒤에 선택적으로 `- detail` 목록
//   - 각 entry 사이에 빈 줄 1개 (grep "^## \[" 파싱 안정성)
//
// caller(wiki-fs) 가 실제 파일 append 를 담당. 이 모듈은 **포맷팅 + 파싱**
// 순수 함수만 제공한다.

export type LogEventType = "ingest" | "query" | "lint" | "graph-build";

export interface LogEntry {
  /** UTC 기준 timestamp. YYYY-MM-DD 가 헤더에 들어간다. */
  date: Date;
  type: LogEventType;
  /** 한 줄 요약 (헤더 오른쪽) */
  summary: string;
  /** 선택. 본문에 dash-bullet 으로 렌더 */
  details?: string[];
}

const LOG_FILE_HEADER = [
  "# Jarvis Wiki Log",
  "",
  "Append-only timeline of ingest / query / lint / graph-build events.",
  "Parse with `grep \"^## \\[\" log.md | tail -5`.",
  "",
  "",
].join("\n");

function formatDateUtc(d: Date): string {
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatLogEntry(entry: LogEntry): string {
  const header = `## [${formatDateUtc(entry.date)}] ${entry.type} | ${entry.summary}`;
  const details = entry.details ?? [];
  if (details.length === 0) {
    return `${header}\n\n`;
  }
  const bullets = details.map((d) => `- ${d}`).join("\n");
  return `${header}\n${bullets}\n\n`;
}

export function appendLogEntry(existing: string, entry: LogEntry): string {
  const block = formatLogEntry(entry);
  if (!existing || existing.trim().length === 0) {
    return LOG_FILE_HEADER + block;
  }
  // 기존 내용을 그대로 보존하고 블록만 끝에 붙인다. 이미 트레일링 newline
  // 이 있으면 중복 추가 없이 블록만 이어 붙인다.
  return existing.endsWith("\n") ? existing + block : existing + "\n" + block;
}

const HEADER_RE = /^## \[\d{4}-\d{2}-\d{2}\][^\n]*/gm;

export function parseRecentLogHeaders(text: string, limit = 5): string[] {
  const all = text.match(HEADER_RE) ?? [];
  // 최신이 뒤에 있다고 가정 (append-only). 최신 N개를 반대 순으로 반환.
  return all.slice(-limit).reverse();
}
