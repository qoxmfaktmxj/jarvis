import { resolveAllowedWikiSensitivities } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";

/**
 * apps/web/lib/server/wiki-sensitivity.ts
 *
 * Phase-W2 C2 / Phase-W3 PR3 — wiki_page_index.sensitivity 권한 매트릭스.
 *
 * DB sensitivity 규약: PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY.
 * - PUBLIC, INTERNAL: KNOWLEDGE_READ
 * - RESTRICTED: KNOWLEDGE_READ + KNOWLEDGE_REVIEW(승급된 권한)
 * - SECRET_REF_ONLY: KNOWLEDGE_READ + SYSTEM_ACCESS_SECRET
 *   (SYSTEM_ACCESS_SECRET 이 있으면 본문까지 열람 허용. 권한이 없으면
 *    canViewSensitivity 가 false 를 반환해 페이지 자체가 차단됨.
 *    "본문 대신 메타만" 식의 partial-view 는 현재 구현되어 있지 않음 —
 *    W2 시점 기준 SECRET_REF_ONLY 는 '시스템 시크릿 소유자 전용' 의미.)
 *
 * Phase-W3 PR3: `resolveAllowedWikiSensitivities` 기반으로 재구성.
 * 규칙 중복 제거 — rbac.ts 의 단일 진입점에서 규칙을 관리한다.
 */
export type DbSensitivity =
  | "PUBLIC"
  | "INTERNAL"
  | "RESTRICTED"
  | "SECRET_REF_ONLY";

const SENSITIVITY_VALUES: readonly DbSensitivity[] = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY",
];

export function isDbSensitivity(value: unknown): value is DbSensitivity {
  return (
    typeof value === "string" &&
    (SENSITIVITY_VALUES as readonly string[]).includes(value)
  );
}

/**
 * 본문(body) 열람 가능 여부.
 *
 * `resolveAllowedWikiSensitivities` 기반으로 동작한다:
 *   - ADMIN_ALL → 전체 4값
 *   - KNOWLEDGE_READ → PUBLIC, INTERNAL
 *   - KNOWLEDGE_REVIEW → +RESTRICTED
 *   - SYSTEM_ACCESS_SECRET → +SECRET_REF_ONLY
 */
export function canViewSensitivity(
  session: JarvisSession,
  dbSensitivity: string,
): boolean {
  return resolveAllowedWikiSensitivities(session.permissions).includes(dbSensitivity);
}
