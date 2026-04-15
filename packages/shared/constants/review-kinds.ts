/**
 * packages/shared/constants/review-kinds.ts
 *
 * Phase-W2 P4 — review_request.kind / wiki_review_queue.kind 공통 enum.
 * 두 테이블 사이의 kind 값을 통일하기 위한 SSoT.
 */
export const REVIEW_KINDS = [
  "contradiction",
  "lint-report",
  "sensitivity_escalation",
  "boundary_violation",
] as const;

export type ReviewKind = (typeof REVIEW_KINDS)[number];

export function isReviewKind(value: unknown): value is ReviewKind {
  return (
    typeof value === "string" && (REVIEW_KINDS as readonly string[]).includes(value)
  );
}
