# RSC/Server Action 경계 감사 — 기준선

- **최초 생성:** 2026-04-15 (W3-X10, v1.0)
- **갱신:** 2026-04-15 (W3-X10 eng-review, v1.1 — heuristic 보정 후)
- **도구:** `scripts/audit-rsc-boundary.mjs` v1.1
- **모드:** `--warn` (기본, exit 0)
- **목적:** W4에서 `--error` 모드로 승격 시 regression 기준점

## 실행 결과 (현재 기준선 — v1.1)

```
$ node scripts/audit-rsc-boundary.mjs
[R4 WARN]    apps/web/app/api/auth/dev-login/route.ts:1 — route.ts에 db import 있으나 권한/세션 체크 없음

--- Summary ---
ERROR: 0건, WARN: 1건
```

- **Exit code (기본 `--warn` 모드):** 0
- **Exit code (`--error` 모드):** 1 (WARN ≥ 1건)

## 해석

### ERROR (0건)
- R1 ("use client" → 서버 전용 모듈 import) 위반 없음.
- R5 ("use client" → 비공개 env 직접 접근) 위반 없음.
- 클라이언트 번들에 서버 시크릿 유출 경로 정적 검출 없음.

### WARN (1건) — 구조적 false positive, 의도적 예외

| 파일 | 이유 | 판단 |
|------|------|------|
| `apps/web/app/api/auth/dev-login/route.ts` | 개발 전용 bypass. `NODE_ENV === "production"` 시 404 반환. 프로덕션 비활성. | false positive |

## heuristic 보정 이력

### v1.0 → v1.1 (2026-04-15 eng-review)

`AUTH_CHECK` 정규식에 3개 식별자 추가 (21건 → 2건):

```js
// v1.0
const AUTH_CHECK = /\b(requirePermission|requireSession|assertSession|getServerSession|auth\s*\()/;

// v1.1
const AUTH_CHECK = /\b(requirePermission|requireSession|assertSession|getServerSession|auth\s*\(|resolveContext|getSession|requireApiSession)/;
```

| 추가 식별자 | 해소된 false positive |
|-----------|---------------------|
| `resolveContext` | `review-queue/actions.ts` R3 3건 (approve/reject/defer) |
| `getSession` | `wiki/manual/.../edit/actions.ts` R3 1건 (saveWikiPage) |
| `requireApiSession` | `apps/web/app/api/**/route.ts` R4 15건 |

## 재실행 기준점

- 현재 기준선: **ERROR 0 / WARN 1**
- 향후 ERROR 1건 이상 증가 또는 WARN 2건 이상 시 regression으로 간주.
- 잔여 1건(`auth/dev-login`)은 W4 allowlist 경로 처리 예정.

## 향후 조치 (W4)

1. R4 스캐너에 `auth/dev-login` 경로 allowlist 추가 → WARN 0건 달성
2. `pnpm audit:rsc --error`를 CI blocking 단계로 승격
3. `resolveContext`는 로컬 헬퍼명이라 향후 동명 비인증 함수 도입 시 false negative 위험 — 명명 규칙 가이드라인 수립 검토
