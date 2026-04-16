// packages/shared/constants/llm-ops.ts
// Phase-W1 T5 (Track B2): LLM 호출 op 타입 중앙 상수.
//
// 목적:
//   - `llm_call_log` 관측에서 op 타입을 고정 문자열로 강제하여 오타/누락을 막는다.
//   - wiki.* 오퍼레이션 6종(Analysis/Generation/Shortlist/Synthesis/SemanticLint/SaveAsPage)을
//     기존 ask/embed와 같은 수준의 1급 op로 관측한다.
//   - budget-guard가 workspace별 일일 예산 집계 시 wiki.* 호출도 전부 합산 대상이 되도록
//     op 문자열을 일관되게 유지한다.
//
// DB 연계 (B1 완료):
//   - `llm_call_log` 테이블에 `op` varchar(50) nullable 컬럼이 추가됨.
//   - `logLlmCall`의 `op` 필드가 DB INSERT에 매핑되어 있다.
//   - 예산 집계(`assertBudget`)는 workspace + date + status='ok'로 합산하므로
//     wiki.* 호출이 동일 경로로 INSERT되면 자동 포함된다.

/** 기존(비 wiki) LLM 호출 op 타입. */
export const CORE_OPS = [
  "ask",
  "embed",
  "tutor",
] as const;

export type CoreOp = (typeof CORE_OPS)[number];

/** Phase-W1 T5에서 추가되는 wiki 오퍼레이션 op 타입 6종. */
export const WIKI_OPS = [
  "wiki.ingest.analysis",
  "wiki.ingest.generation",
  "wiki.query.shortlist",
  "wiki.query.synthesis",
  "wiki.lint.semantic",
  "wiki.save-as-page",
] as const;

export type WikiOp = (typeof WIKI_OPS)[number];

/** 모든 op 타입 union. logLlmCall.op 파라미터 타입으로 사용. */
export const ALL_OPS = [...CORE_OPS, ...WIKI_OPS] as const;

export type OpType = (typeof ALL_OPS)[number];

/** op 문자열이 wiki 네임스페이스인지 판별. Sentry 태깅 등에 사용. */
export function isWikiOp(op: string): op is WikiOp {
  return (WIKI_OPS as readonly string[]).includes(op);
}

/** op 문자열이 유효한 OpType인지 런타임 가드. */
export function isValidOp(op: string): op is OpType {
  return (ALL_OPS as readonly string[]).includes(op);
}
