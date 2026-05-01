"use client";

import type { Permission } from "@jarvis/shared/constants/permissions";

/**
 * apps/web/components/auth/Authorized.tsx
 *
 * UI hint HOC for permission-gated content (Task 6 — option 4C).
 *
 * **NOT A SECURITY BOUNDARY.** This component only conditionally renders its
 * children based on a permissions array passed in props. It cannot enforce
 * authorization: a user can flip the boolean in DevTools and reveal the hidden
 * DOM. The real guard MUST be on the server side — server actions, RSC route
 * authorization, or REST endpoint middleware.
 *
 * **What this is for:** hiding UI affordances (buttons, links, sections) for
 * users who lack the corresponding permission, so they aren't confused by
 * affordances they can't actually use. The server-side guard catches anyone
 * who tries to invoke the action regardless.
 *
 * **Usage pattern:**
 * ```tsx
 * // Server component passes permissions array to a client island.
 * // The action's *real* guard is `requirePermission(PERMISSIONS.ADMIN_ALL)`
 * // inside the server action it dispatches to.
 * <Authorized permissions={session.permissions} perm={PERMISSIONS.ADMIN_ALL}>
 *   <SaveButton />  // SaveButton calls a "use server" action that re-checks.
 * </Authorized>
 *
 * // ANY-match: render if user has at least one of the listed permissions.
 * <Authorized
 *   permissions={session.permissions}
 *   perm={[PERMISSIONS.NOTICE_CREATE, PERMISSIONS.ADMIN_ALL]}
 * >
 *   <NewNoticeButton />
 * </Authorized>
 * ```
 *
 * **Implementation note:** the visibility check duplicates the same
 * `permissions.includes(perm)` logic that `hasPermission(session, perm)` in
 * `@jarvis/auth/rbac` performs internally. We don't import `hasPermission`
 * directly because it takes a full `JarvisSession` and we only have the
 * pre-extracted permissions array from props (avoids serialising the entire
 * session to the client island).
 *
 * **Edge case:** an empty `perm` array fails closed (`[].some()` is `false`,
 * so children are hidden). If you want "no requirement = always show", don't
 * wrap the children in `<Authorized>` at all.
 */

type Props = {
  /** 세션의 permissions 배열 (server component에서 props로 전달) */
  permissions: string[];
  /** 필요한 권한 코드 — 단일 또는 배열(ANY 매칭). `Permission` 타입으로 묶어 typo를 컴파일 타임에 잡는다. */
  perm: Permission | Permission[];
  /** 권한 없을 때 표시할 대체 UI (기본값: null) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

export function Authorized({ permissions, perm, fallback = null, children }: Props) {
  const required: readonly Permission[] = Array.isArray(perm) ? perm : [perm];
  const ok = required.some((p) => permissions.includes(p));
  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}
