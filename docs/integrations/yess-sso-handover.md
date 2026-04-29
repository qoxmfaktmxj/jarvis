# Yess ↔ Jarvis 인증 통합 가이드

> Yess(별도 레포·서버)에서 Jarvis 세션을 공유받아 인증을 수행하기 위한 통합 가이드.
> Jarvis 측 변경 PR 머지 후 Yess 팀에 그대로 전달.

## 1. 컨텍스트

- Yess는 사내 업무 시스템 Jarvis와 **같은 Postgres DB**·**같은 사용자 풀**을 공유합니다.
- 로그인 UI/로그아웃은 Jarvis 단독 책임. Yess는 세션 검증과 권한 체크만 합니다.
- 새 user 테이블/회원가입 라우트 신설 금지.

## 2. 도메인 / 쿠키

- Jarvis: `https://jarvis.isusystem.com`
- Yess: `https://yess.isusystem.com`
- 쿠키 `sessionId`는 부모 도메인 `.isusystem.com`에 발급되어 양쪽 자동 공유됩니다.
- `httpOnly`, `secure`(운영), `sameSite=lax`. TTL 8시간(기본) / 30일(keepSignedIn).

## 3. 환경변수 (Yess 레포)

```dotenv
DATABASE_URL=postgresql://...                    # Jarvis와 동일 인스턴스
COOKIE_DOMAIN=.isusystem.com                     # 검증/리다이렉트 시 참조 (Yess가 발급은 안 함)
JARVIS_LOGIN_URL=https://jarvis.isusystem.com/login
JARVIS_LOGOUT_URL=https://jarvis.isusystem.com/api/auth/logout
ALLOWED_RETURN_HOSTS=jarvis.isusystem.com,yess.isusystem.com
```

## 4. 미들웨어 의사코드 (모든 보호 라우트)

```ts
async function requireSession(req: Request) {
  const sessionId = getCookie(req, "sessionId");
  if (!sessionId) return redirectToJarvisLogin(req);

  const row = await db.execute(
    `SELECT data, expires_at FROM user_session
     WHERE id = $1 AND expires_at > NOW()
     LIMIT 1`,
    [sessionId],
  );
  if (!row) return redirectToJarvisLogin(req);

  const session = row.data as JarvisSession;
  return session;
}

function redirectToJarvisLogin(req: Request) {
  const ret = encodeURIComponent(req.url);
  return Response.redirect(
    `${process.env.JARVIS_LOGIN_URL}?redirect=${ret}`,
    302,
  );
}
```

## 5. `JarvisSession` 타입 (복사 — Jarvis `packages/auth/types.ts` 단일 소스)

```ts
export interface JarvisSession {
  userId: string;
  workspaceId: string;
  employeeId: string | null;
  email: string;
  name?: string;
  roles: string[];          // ["ADMIN" | "MANAGER" | "DEVELOPER" | "VIEWER" | "CONTRACTOR"]
  permissions: string[];    // 예: ["knowledge:read", "project:write"] — Jarvis 글로벌 권한 34개 중 일부
  orgId?: string;
  createdAt: number;        // epoch ms
  expiresAt: number;        // epoch ms
}
```

> ⚠️ Jarvis 측에서 변경되면 PR/공지를 통해 동기화. `user_session.data` JSONB 구조 변경은 Yess에 직접 영향.

## 6. DB 접근 규칙 (개발 규약)

- `user_session`, `user`, `user_role`, `role` 테이블에 **INSERT/UPDATE/DELETE 금지**. SSoT는 Jarvis. (DB-level 강제는 안 함, 개발 규약)
- Yess만의 활동 로그·메뉴 권한 등은 `yess_*` 접두 자체 테이블 신설.

## 7. 절대 만들지 말 것

- `/api/auth/login`, `/api/auth/signup` 같은 인증 발급 라우트
- 자체 비밀번호 검증·해싱
- `sessionId` 쿠키 직접 set/clear (로그아웃은 `JARVIS_LOGOUT_URL?redirect=...`로 리다이렉트)
- 자체 user 테이블 / 회원가입 흐름

## 8. Yess 전용 권한

- `JarvisSession.permissions[]`에는 **Jarvis 글로벌 권한만** 포함됩니다.
- Yess 메뉴별 권한(예: `yess:menu_a:read`)은 Yess가 자체 매핑:
  - 옵션 a: Yess 자체 `yess_role_permission` 테이블 (role_code, permission_code)
  - 옵션 b: 코드 상수로 ROLE → permissions 정적 매핑
- 매핑 키는 `JarvisSession.roles[]` 또는 `userId`.

## 9. 로그아웃 흐름

Yess의 로그아웃 버튼은 다음과 같이:

```ts
const ret = encodeURIComponent(window.location.href);
window.location.href = `${JARVIS_LOGOUT_URL}?redirect=${ret}`;
```

흐름:
1. Yess 로그아웃 버튼 클릭 → `jarvis.isusystem.com/api/auth/logout?redirect=https://yess.isusystem.com/<현재경로>`
2. Jarvis가 세션 삭제 + 쿠키 클리어
3. `https://yess.isusystem.com/<현재경로>`로 302
4. Yess 미들웨어가 미인증 감지 → `https://jarvis.isusystem.com/login?redirect=https://yess.isusystem.com/<현재경로>`로 302
5. 사용자가 Jarvis 로그인 페이지를 봄
6. 재로그인 성공 → 자동으로 `https://yess.isusystem.com/<현재경로>`로 복귀 ✓

## 10. 보안 체크리스트

- [ ] `redirect` 파라미터는 `ALLOWED_RETURN_HOSTS` 화이트리스트 검증 (open redirect 방지)
- [ ] 미들웨어를 모든 보호 라우트 + RSC 컴포넌트 진입점에 적용
- [ ] 쿠키 직접 발급/수정 금지
- [ ] `expires_at > NOW()` 조건 누락 금지
- [ ] DB 쓰기 금지 (개발 규약 준수)

## 11. 스키마 변경 커뮤니케이션

- `user_session.data` JSONB 구조 변경 → Yess 영향. Jarvis 팀에서 변경 전 공지 + 양 레포 동시 PR.
- `user`/`role` 컬럼 **추가**는 Yess가 무시하면 OK.
- 컬럼 **삭제**/타입 변경 → 사전 합의 필수.

## 12. 개발 환경 주의

- `localhost:3010`(Jarvis) / `localhost:3011`(Yess)는 부모 도메인 쿠키 공유 안 됨. 개발에선 호스트 한정 쿠키로 폴백되어 SSO가 동작하지 않습니다 (각자 로그인 필요).
- SSO는 운영(`.isusystem.com` 도메인) 배포에서만 동작합니다.

## 13. 참조 구현 (Jarvis 코드)

- 쿠키 옵션: `packages/auth/cookie.ts` (`buildSessionCookieOptions`)
- Return URL 검증: `packages/auth/return-url.ts` (`validateReturnUrl`)
- 로그인 페이지: `apps/web/app/(auth)/login/page.tsx`
- 로그인 라우트: `apps/web/app/api/auth/login/route.ts`
- 로그아웃 라우트: `apps/web/app/api/auth/logout/route.ts`
