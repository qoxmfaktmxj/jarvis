import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { isAdmin } from '@jarvis/auth/rbac';

/**
 * AdminLayout — RBAC 가드 전용. UI wrapping 없음.
 *
 * 절대 금지:
 *   - `<main>` 태그 (AppShellMain이 이미 <main id="main-content"> 단일 사용 —
 *     nested <main>은 a11y 위반)
 *   - 자체 padding / max-w / mx-auto / overflow 컨테이너 (AppShellMain이 padding의
 *     단일 진실. 여기서 추가하면 admin 라우트만 다른 위/좌/우 여백을 갖게 되어
 *     화면 정합이 깨짐)
 *
 * 회귀 방지: 이 파일을 수정할 때 `<main>` 또는 padding 클래스 추가 금지.
 * AppShellMain 한 군데에서만 전역 wrapper 책임을 진다.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionId = (await headers()).get('x-session-id') ?? '';
  const session = await getSession(sessionId);

  if (!session || !isAdmin(session)) {
    redirect('/dashboard?error=forbidden');
  }

  return <>{children}</>;
}
