# Jarvis Ask AI 안정화 — Phase 2 (P2/P3) Handoff (2026-04-29)

## 너에게 (수신자)

이 prompt 하나로 작업을 이어가야 한다. 컨텍스트가 없으니 아래를 먼저 읽어라. 사용자는 한국어로 답한다 (CLAUDE.md 규칙). 모든 검증 명령은 `&&`로 2회 연속 실행 (flaky 차단).

## 프로젝트

- **루트 (main worktree)**: `C:/Users/kms/Desktop/dev/jarvis`
- **OS**: Windows + Bash. 절대경로 권장.
- **스택**: pnpm + turborepo, Next.js 15 / React 19 / Drizzle / Vitest
- **LLM 모델 정책 (FIXED)**: gpt-5.4 / gpt-5.4-mini / text-embedding-3-small만. Claude 런타임 금지.
- **위험 작업 (실행 전 사용자 컨펌)**: 파일/디렉토리 삭제, git force push/reset/rebase, 환경변수·DB·전역 패키지 변경.
- **하네스 진입**: `jarvis-feature` skill — 도메인 컨텍스트만 주입, 방법론은 `superpowers:*` 위임.

## 직전 단계 완료 (2026-04-29 오후, main `034f40f` = origin/main)

- 옵션-2 P0 4건 + 첫 리뷰 P1 #1·#4 흡수 → 3 PR로 분할 → main 머지 + push 완료
  - PR-1 (`9c7b840`): Ask AI 도구 ACL 통합 (`canViewWikiPage` 헬퍼 신설) + `wiki_grep` tenant/quality
  - PR-2 (`7c351db`): Legacy ask path 정리 (`_legacyAskAI_unused` 삭제, `router.ts`/`graph-context.ts` 삭제, `FEATURE_PAGE_FIRST_QUERY` flag 제거)
  - PR-3 (`5b82f80`): Citation 렌더링 통합 (`AnswerBody` 추출, live `[[slug]]` 회귀 수정)
- origin/main(SSO PR #32) 머지 (`ad1a498`) — `packages/auth/index.ts` 충돌 해결 (양쪽 export 보존)
- Cleanup PR (`034f40f`) main 머지 + push 완료
  - `bbfc1a2` 본 plan 문서 archive (`docs/superpowers/plans/2026-04-29-ask-rbac-citation-stabilization.md`)
  - `7be0434` `tutor.test` stale `retrieveRelevantClaims` mock 제거
  - `76abdff` `wiki_grep` alias 인라인 코멘트
  - `ce63144` `FEATURE_PAGE_FIRST_QUERY` 코멘트 drift 정리
  - `92bf835` `pageFirstAsk` dead-code 제거
  - `702504e` `AnswerBody` first-wins 단위 테스트
- 검증: code-reviewer GO, auth 143×2 / ai 253+1skip×2 / web 406×2 / type-check / lint warnings only / pre-push build pass
- worktree 정리 완료 — 단 `.claude/worktrees/suspicious-moser-fe98c3` 디렉토리만 OS lock으로 disk 잔존 (git 측 unregister, branch 삭제됨, 무해)

## 사용자 명시 의도

> **"P2, P3 진행 어떻게 할건지 구체화해보자"**

순서: (1) 5 항목 영향 매핑 + 작업 단위 제안 → (2) 사용자 컨펌 (아래 4 결정 항목) → (3) 컨펌된 옵션대로 실행.

이 문서는 (1) 결과물. 다음 세션은 **(2) 컨펌 단계**부터 시작.

## P2/P3 항목 5건 — 영향 매핑 (실측 grep)

| # | 항목 | 위험 (CIA) | 영향 영역 (실측 파일) | TDD | LoC 범위 |
|---|---|---|---|---|---|
| 1 | **pg-search SQL parameterize** | HIGH (SQLi via `sql.raw` + user input mix) | `packages/search/{precedent-search,pg-search,facet-counter}.ts` · `packages/ai/page-first/{shortlist,catalog,expand}.ts` · `packages/ai/sql-utils.ts` · `apps/web/app/(app)/infra/page.tsx` (8 production 파일 + 1 test) | ✅ | 200–400 |
| 2 | **presign magic-byte 검증** | MEDIUM (XSS/RCE via content-type spoof) | `apps/web/app/api/upload/presign/route.ts` (+ `apps/web/components/upload/FileUploader.tsx` client-side 검토) | ✅ | 50–150 |
| 3 | **CSP + security headers** | MEDIUM (defense-in-depth, XSS 방어 부재) | `apps/web/middleware.ts` (또는 신규) + `next.config.{ts,js}`. 현재 `Content-Security-Policy`/`x-frame-options`/`x-content-type-options`/`strict-transport-security`/`referrer-policy` **0 매치** = 미설정. | ✅ snapshot | 30–80 |
| 4 | **prompt injection nonce** | HIGH (AI 출력 무결성·기밀성 — user content가 system prompt에 직접 주입되어 instruction 변조 가능) | `packages/ai/{agent/ask-agent,tutor,case-context,directory-context,page-first/synthesize}.ts` (5 파일) | ✅ | 100–300 |
| 5 | **sensitivity helper 통합** | LOW (refactor — drift 방지) | `packages/auth/rbac.ts:54` `canAccessKnowledgeSensitivityByPermissions` 정의 + `apps/web/lib/queries/knowledge.ts` 호출 1곳. PR-1에서 신설된 `canViewWikiPage`로 흡수 또는 명시적 분리 유지 결정. | ✅ | 50–100 |

## 의존성 / 충돌 분석

- **5개 모두 file 영역 disjoint** (`git merge-tree` 5-way 충돌 0 전망).
- #1과 #4가 같은 `packages/ai/` 내부지만 sub-folder 다름 (`page-first/{shortlist,catalog,expand}.ts` vs `page-first/synthesize.ts`) — 한 파일 안 만남.
- #5는 production 사용처 1곳뿐이라 risk 거의 0.

## CIA 우선순위

**#1 (SQLi) > #4 (prompt-inj) > #2 (upload spoof) > #3 (CSP defense-in-depth) > #5 (refactor)**

## 진행 옵션 (사용자 컨펌 대상)

| 옵션 | 구성 | 시간 | 추천도 |
|---|---|---|---|
| **A. 5 PR 동시 병렬** (subagent-driven-development) | 5 worktree + 5 implementer agent 동시 dispatch (sonnet) + spec/quality reviewer + 통합 리뷰 1회 + 순차 머지 + push | ~60–90분 | **★★★** |
| B. 위험순 단계별 (#1+#4 → #2+#3 → #5) | 3 phase, 각 phase 머지 후 다음 진행 | ~2시간 | ★★ |
| C. 5건 단일 PR 묶음 | 1 worktree 1 PR (review 부담 ↑) | ~1시간 | △ |

**추천: A.** disjoint + 사용자 feedback (`feedback_execution_model.md`: "계획=Opus(컨트롤러), 코드=sonnet 서브에이전트 병렬 디스패치. subagent-driven-development 활용")에 정확히 부합.

## 컨펌 받을 결정 4가지

1. **범위**: 5건 모두 vs 우선 #1+#4 (HIGH risk 2건만)?
2. **방식**: 옵션 A (병렬) vs B (단계별) vs C (묶음)?
3. **추가 sweep**: 진행 전 코드베이스에서 P2/P3 candidate 추가 발견을 위한 quick security sweep — `dangerouslySetInnerHTML`, `eval(`, weak JWT, missing CSRF, IDOR, race-condition advisory locks, regex DoS — 30분~1시간 추가 비용. 진행 vs 스킵?
4. **budget.test flaky 안정화** — `packages/ai/__tests__/budget.test.ts > "passes under budget"` turbo 병렬에서 20초 timeout (직접 실행 5.6초). pre-push hook이 매번 fail 위험. P2 묶음에 포함 vs 별도 micro-PR vs 보류?

## main 현재 상태

- HEAD `034f40f` = origin/main
- Dirty (사용자 본인 작업, 보존 필수): `infra/cliproxy/config.yaml` modified, `DESIGN-notion.md` untracked
- 머지 완료된 worktree·branch는 모두 정리됨

## 검증 게이트 (P2/P3 작업용)

| 변경 영역 | 명령 |
|---|---|
| 항상 | `pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web lint` |
| ai 패키지 (#1, #4) | `pnpm --filter @jarvis/ai test` ×2 |
| auth (#5) | `pnpm --filter @jarvis/auth test` ×2 |
| web (#2, #3, #5) | `pnpm --filter @jarvis/web test` ×2 |
| search 패키지 (#1) | `pnpm --filter @jarvis/search test` ×2 |
| 스키마 변경 시 | `pnpm db:generate` + `node scripts/check-schema-drift.mjs --precommit` |
| wiki 도메인 | `pnpm wiki:check` |
| RSC 경계 | `pnpm audit:rsc` |
| UI 라우트 변경 / PR 직전 | `pnpm --filter @jarvis/web exec playwright test` |

모든 명령 ×2회 (CLAUDE.md flaky 차단 규칙). pre-push hook이 turbo build로 검증 — push 시 build pass 필요.

## 핵심 헬퍼 / 파일 (빠른 컨텍스트)

- ACL 단일 진입점: `packages/auth/wiki-acl.ts` `canViewWikiPage({sensitivity, requiredPermission, publishedStatus}, permissions[])` (3 PR에서 신설, ADMIN_ALL 우회)
- legacy ACL (#5 통합 대상): `packages/auth/rbac.ts:54` `canAccessKnowledgeSensitivityByPermissions`
- canonical sensitivity 해석: `packages/auth/rbac.ts:215` `resolveAllowedWikiSensitivities`
- 활성 askAI: `packages/ai/ask.ts:399-516` (agent tool-use loop + cache + budget + logLlmCall)
- agent system prompt: `packages/ai/agent/ask-agent.ts` (#4 prompt injection nonce 대상)
- WIKILINK_REGEX: `packages/wiki-fs/src/wikilink.ts`
- middleware: `apps/web/middleware.ts` (#3 CSP 추가 위치 후보)
- 스키마: `packages/db/schema/wiki-page-index.ts:46,53` `requiredPermission varchar(50)`, `publishedStatus varchar(10) default 'draft'`

## 알려진 이슈 (미해결)

| 이슈 | 위치 | 영향 | 처리 |
|---|---|---|---|
| budget.test flaky | `packages/ai/__tests__/budget.test.ts:15` `"passes under budget"` | pre-push hook 종종 fail (20s timeout) | 결정 4번 |
| `.claude/worktrees/suspicious-moser-fe98c3` 디렉토리 disk 잔존 | OS file lock | 무해 (git 측 unregister) | lock 풀리면 수동 `rm -rf` |
| main worktree dirty | `infra/cliproxy/config.yaml`, `DESIGN-notion.md` | 사용자 본인 작업 | 보존 |

## 시작 명령 (수신자 첫 액션)

```bash
# 1. 위치 확인
cd C:/Users/kms/Desktop/dev/jarvis && git fetch origin main && git log --oneline -3 && git worktree list

# 2. 본 핸드오프 read (이 파일 자체)
# C:/Users/kms/Desktop/dev/jarvis/docs/superpowers/plans/2026-04-29-ask-p2-p3-handoff.md

# 3. 사용자에게 4개 컨펌 받고 진행
#    - 범위 / 방식 / 추가 sweep / budget.test 처리
```

## 옵션 A 실행 시 권장 흐름 (참고)

1. **컨펌 단계**: 사용자 4 결정 받음
2. **추가 sweep (선택)**: 결정 3 = yes 시, code-reviewer 또는 security-reviewer agent 1회 dispatch
3. **planning**: superpowers `writing-plans` skill로 5 task plan 1개 작성 (또는 `brainstorming` skill 먼저)
4. **worktree 5개 생성**: `using-git-worktrees` skill — `claude/p2-{1..5}` 또는 의미 있는 이름 (`claude/p2-sql-param`, `claude/p2-presign-magic`, `claude/p2-csp-headers`, `claude/p2-prompt-nonce`, `claude/p2-sensitivity-merge`)
5. **5 implementer agent 병렬 dispatch** (background, sonnet)
   - 각 agent: 자신 task TDD → 검증 → atomic commits
   - 절대 main 머지/push 금지
6. **순차 결과 수신** (background notification)
7. **spec-reviewer per PR** (code-reviewer 또는 critic agent) — 각 PR diff 보안 검토
8. **통합 리뷰 1회** (code-reviewer agent) — 5 PR cross-cutting 검증 (`git merge-tree` 5-way 시뮬, CIA 일관성)
9. **순차 머지** (위험순: #1 → #4 → #2 → #3 → #5) — 각 머지 후 통합 검증 ×2 → push (pre-push build pass)
10. **worktree·branch 정리** — disk lock 시 PowerShell `\\?\` long-path 강제

## 참고 — 직전 작업 학습

- **pre-push hook**: turbo로 모든 패키지 test + build. budget.test flaky로 종종 fail. retry 1~2회면 통과.
- **Windows long path / file lock**: `git worktree remove --force`로 안 되는 경우 PowerShell `Remove-Item -LiteralPath "\\?\<path>" -Recurse -Force`. 일부 lock된 file은 다음 세션까지 stale.
- **main worktree node_modules**: `pnpm install --frozen-lockfile`로 정기 sync 필요 (origin/main 머지 후 deps 변경 시).
- **검증 명령은 항상 ×2** (CLAUDE.md feedback memory 규칙).
- **머지 메시지 스타일**: `Merge branch '<name>' — <subject>` (기존 main 컨벤션).
