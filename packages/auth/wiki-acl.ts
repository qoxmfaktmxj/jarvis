import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { resolveAllowedWikiSensitivities } from "./rbac.js";

export interface WikiPageAclSubject {
  sensitivity: string;
  requiredPermission: string | null;
  publishedStatus: string;
}

/**
 * Wiki tool / wiki index UI / page-first shortlist 공통 ACL 진입점.
 *
 * 세 가지를 동시에 본다:
 *   1. publishedStatus — 'published'만 비-admin에게 노출
 *   2. requiredPermission — null이 아니면 그 permission 보유 필수
 *   3. sensitivity — resolveAllowedWikiSensitivities() 재사용
 *
 * ADMIN_ALL은 모든 단계 우회.
 */
export function canViewWikiPage(
  subject: WikiPageAclSubject,
  permissions: readonly string[],
): boolean {
  const perms = permissions as string[];
  const isAdmin = perms.includes(PERMISSIONS.ADMIN_ALL);

  if (!isAdmin && subject.publishedStatus !== "published") {
    return false;
  }

  if (
    !isAdmin &&
    subject.requiredPermission &&
    !perms.includes(subject.requiredPermission)
  ) {
    return false;
  }

  const allowed = resolveAllowedWikiSensitivities(perms);
  return allowed.includes(subject.sensitivity);
}
