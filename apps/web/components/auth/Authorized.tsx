"use client";

/**
 * apps/web/components/auth/Authorized.tsx
 *
 * UI hint HOC for permission-gated content (Task 6 — option 4C).
 *
 * **Role:** Client-side UI hint ONLY. Server action 가드가 진짜 권한 체크를 수행하고,
 * 이 컴포넌트는 사용자에게 UI 단서를 제공하거나 버튼을 숨기는 데만 사용한다.
 *
 * **Usage pattern:**
 * ```tsx
 * // Server component에서 permissions를 prop으로 내려주는 방식
 * <Authorized permissions={session.permissions} perm="ADMIN_ALL">
 *   <button>관리자 전용 버튼</button>
 * </Authorized>
 *
 * // 여러 권한 중 하나라도 있으면 표시 (ANY 매칭)
 * <Authorized permissions={session.permissions} perm={["NOTICE_CREATE", "ADMIN_ALL"]}>
 *   <button>새 공지 작성</button>
 * </Authorized>
 * ```
 *
 * `hasPermission`은 `@jarvis/auth`의 `rbac.ts`에 이미 구현된 함수를 사용한다.
 * `session.permissions` 배열은 로그인 시 세션에 저장되고 props로 전달된다.
 */

type Props = {
  /** 세션의 permissions 배열 (server component에서 props로 전달) */
  permissions: string[];
  /** 필요한 권한 코드 — 단일 문자열 또는 배열(ANY 매칭) */
  perm: string | string[];
  /** 권한 없을 때 표시할 대체 UI (기본값: null) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

export function Authorized({ permissions, perm, fallback = null, children }: Props) {
  const required = Array.isArray(perm) ? perm : [perm];
  const ok = required.some((p) => permissions.includes(p));
  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}
