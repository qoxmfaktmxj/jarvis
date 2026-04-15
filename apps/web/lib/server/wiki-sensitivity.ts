import { hasPermission } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

/**
 * apps/web/lib/server/wiki-sensitivity.ts
 *
 * Phase-W2 C2 — wiki_page_index.sensitivity 권한 매트릭스.
 *
 * DB sensitivity 규약: PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY.
 * - PUBLIC, INTERNAL: KNOWLEDGE_READ
 * - RESTRICTED: KNOWLEDGE_READ + KNOWLEDGE_REVIEW(승급된 권한)
 * - SECRET_REF_ONLY: KNOWLEDGE_READ + SYSTEM_ACCESS_SECRET
 *   (SYSTEM_ACCESS_SECRET 이 있으면 본문까지 열람 허용. 권한이 없으면
 *    canViewSensitivity 가 false 를 반환해 페이지 자체가 차단됨.
 *    "본문 대신 메타만" 식의 partial-view 는 현재 구현되어 있지 않음 —
 *    W2 시점 기준 SECRET_REF_ONLY 는 '시스템 시크릿 소유자 전용' 의미.)
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
 * SECRET_REF_ONLY 는 SYSTEM_ACCESS_SECRET 권한 필요.
 * RESTRICTED 는 KNOWLEDGE_REVIEW(승급) 권한 필요.
 * INTERNAL/PUBLIC 은 KNOWLEDGE_READ.
 */
export function canViewSensitivity(
  session: JarvisSession,
  dbSensitivity: string,
): boolean {
  // 우선 KNOWLEDGE_READ 가 없으면 어떤 페이지도 못 본다 (기본 접근권한).
  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_READ)) {
    return false;
  }
  switch (dbSensitivity) {
    case "PUBLIC":
    case "INTERNAL":
      return true;
    case "RESTRICTED":
      return hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW);
    case "SECRET_REF_ONLY":
      return hasPermission(session, PERMISSIONS.SYSTEM_ACCESS_SECRET);
    default:
      // 알 수 없는 값은 보수적으로 차단
      return false;
  }
}
