# 2026-04-29 — HIGH Bundle A: Security Edges (4건)

## 배경

P0 PR #31 머지 후 follow-up. 3-에이전트 main 리뷰의 HIGH 등급 4건을 단일 PR로 처리. 영향 영역이 분리되고 변경 폭이 작아 묶음.

브랜치: `claude/high-A-security-edges` / 베이스: `main` (84432d2 P0 머지)
워크트리: `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\high-a-security-edges`

## HIGH 항목

### HIGH-3 ask route INSERT/UPDATE 비트랜잭션
- 위치: `apps/web/app/api/ask/route.ts:242-273`
- 결함: `db.insert(askMessage).values([user, assistant])` 후 `db.update(askConversation).set({ messageCount: +2, lastMessageAt })`가 별도 round-trip. 첫 INSERT 성공 후 UPDATE 실패 시 messageCount drift. `currentMessageCount`로 다음 sortOrder 계산 — race로 sortOrder 충돌, "20개 한도" 잘못 적용.
- 수정: `db.transaction(async tx => { ... })` 래핑.

### HIGH-4 wiki_graph_query legacy permission 함수
- 위치: `packages/ai/agent/tools/wiki-graph-query.ts:142-163`
- 결함: `canAccessKnowledgeSensitivityByPermissions(...)` (legacy)를 `rows.filter(...)`에 사용. wiki-grep / wiki-read가 사용하는 통일 패턴은 `inArray(wikiPageIndex.sensitivity, allowedSensitivities)` (쿼리 레벨 필터 + `getAllowedWikiSensitivityValues`/`resolveAllowedWikiSensitivities`).
- 영향: DEVELOPER가 RESTRICTED 메타(타이틀·관계 그래프) leak 가능. legacy 헬퍼는 `KNOWLEDGE_REVIEW`만 차단 → wiki는 별도 정책.
- 수정: `wiki-grep.ts:85-105` 패턴 따라 쿼리 WHERE 절에 `inArray(wikiPageIndex.sensitivity, allowedSensitivities)` 적용. 앱 레벨 `.filter` 제거.

### HIGH-6 chat 라우트 인증 부재
- 위치: `apps/web/app/api/chat/send/route.ts:4-18`, `apps/web/app/api/chat/reactions/route.ts:4-18`
- 결함: route handler가 Server Action(`sendMessage` / `toggleReaction`)에 모든 검증 위임. 미들웨어 우회·refactor 시 인증 누락 위험.
- 수정: `requireApiSession(req)` 도입하여 라우트 레벨 1차 검증.

### HIGH-7 reset-password stub 200 OK
- 위치: `apps/web/app/api/admin/users/reset-password/route.ts:32-36`
- 결함: 패스워드 리셋 미구현인데 200 OK + `stub: true` 반환 → 운영자 false sense. CRIT-2(P0-2 dev-account)가 활성화될 동인.
- 수정: 501 Not Implemented + `error: "not_implemented"`. 실제 비밀번호 해싱·메일 발송이 들어올 때 200으로 복귀.

## 영향도 체크리스트 (jarvis-architecture 17계층)

| 계층 | 영향 |
|------|------|
| DB 스키마 | 없음 |
| Validation | 없음 |
| 권한 (34) | 없음 |
| 세션 vs 권한 | 변경 없음 |
| Sensitivity 필터 | **HIGH-4** wiki-graph-query 쿼리 레벨 필터로 통일 |
| Ask AI agent | **HIGH-4** wiki_graph_query 도구 |
| Wiki-fs | 없음 |
| 검색 | 없음 |
| 서버 액션/API | **HIGH-3** ask route, **HIGH-6** chat 라우트, **HIGH-7** reset-password |
| 서버 lib | 없음 |
| UI 라우트 | 없음 |
| UI 컴포넌트 | 없음 |
| i18n 키 | 없음 |
| 테스트 | 4건 모두 신규 또는 기존 보강 |
| 워커 잡 | 없음 |
| LLM 호출 | 없음 (wiki_graph_query는 그래프 쿼리, LLM 무관) |
| Audit | 없음 |

## 파일 변경 순서 (jarvis-architecture 20단계)

```
 5. packages/auth/rbac.ts                    (HIGH-4: helper 사용 — 변경 없거나 import만)
 9. packages/ai/agent/tools/wiki-graph-query.ts  (HIGH-4)
14. apps/web/app/api/ask/route.ts            (HIGH-3)
14. apps/web/app/api/chat/send/route.ts      (HIGH-6)
14. apps/web/app/api/chat/reactions/route.ts (HIGH-6)
14. apps/web/app/api/admin/users/reset-password/route.ts  (HIGH-7)
20. **테스트 파일**
    - apps/web/app/api/ask/route.test.ts (HIGH-3 트랜잭션)
    - packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts (HIGH-4 sensitivity)
    - apps/web/app/api/chat/send/route.test.ts (HIGH-6 인증, 신규)
    - apps/web/app/api/chat/reactions/route.test.ts (HIGH-6 인증, 신규)
    - apps/web/app/api/admin/users/reset-password/route.test.ts (HIGH-7 501, 신규/보강)
```

## TDD 순서

각 항목 독립적이라 **순서 자유**. 가장 작은 것(HIGH-7)부터 가장 큰 것(HIGH-4)으로 진행 권장.

### HIGH-7 reset-password 501
1. **red**: 200 → 501 기대로 테스트 변경
2. **green**: `NextResponse.json({ error: 'not_implemented' }, { status: 501 })`
3. UI에 "패스워드 리셋 미구현" 알림 — 별도 follow-up (admin UI 영역)

### HIGH-6 chat 라우트 인증
1. **red**: send/route.test.ts, reactions/route.test.ts (신규) — 인증 헤더 없는 요청 401 기대
2. **green**: 라우트 진입부에 `const auth = await requireApiSession(req); if (auth.response) return auth.response;` 추가. 기존 sendMessage/toggleReaction 호출은 그대로 (이중 검증).

### HIGH-3 ask route 트랜잭션
1. **red**: route.test.ts에 `db.transaction` mock 호출 검증 케이스 추가
2. **green**: `try { ... }` 내부의 INSERT + UPDATE를 `db.transaction(async tx => { ... })`로 래핑
3. messageCount 증가도 트랜잭션 안에서

### HIGH-4 wiki_graph_query sensitivity 통일
1. **red**: wiki-graph-query.test.ts에 RESTRICTED 페이지가 DEVELOPER에게 차단되는 케이스
2. **green**: wiki-grep.ts:85-105 패턴 복제 → `getAllowedWikiSensitivityValues(ctx.permissions)`로 `allowedSensitivities` 추출 후 `inArray(wikiPageIndex.sensitivity, allowedSensitivities)`를 WHERE 절에 직접 추가. `rows.filter(...)` 제거.
3. `canAccessKnowledgeSensitivityByPermissions` import 제거.

## 검증 게이트 (필수, 2회 연속)

```
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm --filter @jarvis/web test --run ask chat admin && pnpm --filter @jarvis/web test --run ask chat admin
pnpm --filter @jarvis/ai type-check && pnpm --filter @jarvis/ai type-check
pnpm --filter @jarvis/ai test --run wiki-graph-query && pnpm --filter @jarvis/ai test --run wiki-graph-query
node scripts/audit-rsc-boundary.mjs
```

DB 스키마 미변경 → schema-drift skip. wiki-fs 미변경 → wiki:check skip. LLM 호출 경로 미변경 → eval:budget-test skip.

## 위험 / 주의

1. **HIGH-4 동작 변경**: 기존 `canAccessKnowledgeSensitivityByPermissions`는 KNOWLEDGE_REVIEW 권한만으로 판단. 새 `getAllowedWikiSensitivityValues`는 wiki 도메인 정책(아마 ADMIN_ALL 또는 KNOWLEDGE_ADMIN 추가) 따름. **차이 검증 필요.**
2. **HIGH-3 ask 라우트는 SSE 스트림 안에서 동작** → transaction 안에서 await 시 stream 완료 후 묶기. controller.close() 전후 순서 주의.
3. **HIGH-6 chat 라우트는 이미 Server Action 내부 인증** → 라우트 레벨 인증이 추가되어도 기능 회귀 없음. 단 401 응답 형태가 변경될 수 있음 (기존 400 vs 신규 401).
4. **HIGH-7 admin UI**: reset-password를 호출하는 admin 화면이 200을 가정하면 UI 깨짐 가능. UI 측 호출자 grep으로 확인 후 메시지 처리.

## 비범위 (이 PR에서 제외)

- HIGH-2 (manual wiki link projection): 별도 worktree B
- HIGH-1 (legacy ask AI 정리): 별도 PR (~1500줄, C 묶음)
- HIGH-5 (세션 30일 회전): 별도 PR (D 묶음, 정책 결정 동반)
- 기타 MED / LOW
