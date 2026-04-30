# P1 보안 잔여 항목 재감사 + 픽스 — 진행 기록

**작성일**: 2026-04-30
**브랜치**: `main` (P1 #1~#7과 동일 정책 — 직접 commit)
**시작 HEAD**: `34b6470` (RBAC 메뉴 트리 핸드오프 직후)
**최종 HEAD**: `df7eba9` (P1 #10 픽스 후)
**워크플로우**: superpowers `requesting-code-review` (general-purpose 에이전트로 P1-class 재감사) + 발견 항목별 직접 픽스

## 배경

2026-04-30 1차 보안 코드리뷰 결과 P1 #1~#7 7건이 머지되었음 (commit log: `6b418b5 ab710ab 67c077f 74c93dd f8bebe0 3965c6b 398e8e3`). 사용자 지시로 **P1 잔여 항목 재발굴 + 일괄 처리 + 테스트 3~4회 + 진행 문서**.

원본 P1 감사 문서가 리포에 보존되지 않은 상태(메모리 룰: "Plans and specs are disposable") → 재감사 실행.

## 워크플로우

1. **Phase 0**: origin/main fast-forward, 환경 healthcheck (docker postgres/minio, baseline type-check 11/11 PASS)
2. **Phase 1**: general-purpose 에이전트 1대 백그라운드 디스패치 — repo-wide P1-class 감사 (cross_tenant / permission_gate / data_exposure / sensitivity_filter / cache_key / csrf / raw_sql 카테고리, 신뢰도 ≥0.8만)
3. **Phase 2**: 발견 항목 우선순위화 → 항목별 픽스 (P1 #5/#4/#6 패턴 모방 + 회귀 테스트)
4. **Phase 3**: 검증 게이트 다중 회차 — type-check ×3 (cached/uncached/forced), 픽스 unit test ×3, 전체 web 566 test ×1, lint ×1, schema-drift ×1
5. **Phase 4**: 항목별 commit (메시지 `fix(<scope>): ... (P1 #N)` 패턴 고수)

## 결정

- **브랜치**: 기존 P1 #1~#7가 main 직접 커밋이었으므로 동일 정책 유지
- **커밋 메시지**: 기존 P1 #N 컨벤션 계승 (P1 #8부터)
- **Untracked 파일**: `data/data/`, `docs/docs/`, `scripts/_preview/`, `scripts/fix-capybara*.py` 등은 보안 무관 — 본 작업에서 손대지 않음
- **테스트 반복**: 사용자 지시 "테스트도 3번4번해버려" 반영 — type-check 3회, 픽스 unit 3회, 전체 회귀 1회로 4벡터 ≥3회

## 진행 로그

### Phase 0 (완료)
- `git pull --ff-only origin main` → 34b6470 sync
- 로컬 untracked 사본(rbac-menu-tree handoff/plan)은 CRLF 차이만 — 삭제 후 origin 버전 채택
- `pnpm install` → xlsx 0.18.5 추가 deps 동기화
- `rm -rf apps/web/.next-dev .next` → 스테일 라우트 참조 제거
- `pnpm type-check` → 11/11 PASS (baseline 확보)

### Phase 1 (완료)
- 에이전트 ID: `a73663b4f0081d56[5]` (general-purpose, background, 558 tool uses, 약 15분)
- 학습 대상: `git show 6b418b5 ab710ab 67c077f 74c93dd f8bebe0 3965c6b 398e8e3`
- 스캔 표면: 57개 `apps/web/app/api/**/route.ts`, 6개 `(app)/**/actions.ts`, 34개 `lib/queries/**`, 5개 ai agent tools, sensitivity helper(`packages/auth/rbac.ts`, `wiki-acl.ts`), schema 31개
- 결과: **3건 (HIGH 1 / MEDIUM 2)**, 1건은 0.8 미만으로 자체 강등
- 결론: "7건 외 라우트 대다수는 `requireApiSession(req, PERMISSION)` + workspaceId 필터 패턴을 충실히 따르고 있어 P1-class drift 는 위 3건이 실질적 잔존의 전부"

### Phase 2 — 픽스

#### P1 #8 — `updateQuickMenuOrder` 권한 게이트 (HIGH, commit `4872872`)
- 파일: `apps/web/app/actions/profile.ts:26-69`, `profile.test.ts`
- 원인: server action 이 세션만 검증하고 권한 게이트 없음. `menu_item.sortOrder` 는 워크스페이스 공용 컬럼이라 일반 직원이 무권한으로 사이드바·대시보드 메뉴 순서를 강제 가능. `revalidatePath('/dashboard')` 로 즉시 모든 사용자에 전파.
- 픽스: P1 #5 (review-queue) 패턴 — `hasPermission(session, ADMIN_ALL)` 검사 후 부재 시 `forbidden`. `admin/menus PUT` 과 동일한 게이트 강도로 정합성 확보.
- 테스트: 회귀 1건 추가(권한 부재시 거부 + db.update 미호출 + revalidatePath 미호출). 총 3 pass.

#### P1 #9 — `admin/codes POST` workspace boundary (MEDIUM, commit `03264c4`)
- 파일: `apps/web/app/api/admin/codes/route.ts:53-62`, `route.test.ts` (신규)
- 원인: 같은 라우트의 PUT/DELETE 는 `ownerGroups` 사전 조회로 workspace 격리를 강제하지만 POST 만 `groupId` 의 워크스페이스 소속을 검증하지 않음. ADMIN_ALL 게이트는 있어 단일 테넌트에서 즉시 폭발하진 않으나, 멀티테넌트 전환·dev/staging dataset 공유 시점에 admin A 가 raw POST 로 다른 워크스페이스 codeGroup 에 임의 codeItem 을 끼워 넣을 수 있는 cross-workspace write 경로.
- 픽스: PUT/DELETE 패턴 적용 — `eq(codeGroup.id, parsed.data.groupId) AND eq(codeGroup.workspaceId, session.workspaceId)` 단건 검증, 미발견 시 404. 단건이라 `inArray` 대신 `eq + limit(1)` 로 간결화.
- 테스트: 회귀 3건 신설(다른 워크스페이스 거부 / 정상 워크스페이스 insert / schema 검증 실패). 총 3 pass.

#### P1 #10 — notice sensitivity 필터 (MEDIUM, commit `df7eba9`)
- 파일: `apps/web/lib/queries/notices.ts`, `notices.test.ts` (신규), `apps/web/app/api/notices/route.ts`, `apps/web/app/api/notices/[id]/route.ts`
- 원인: notice 스키마는 `sensitivity ∈ { PUBLIC, INTERNAL }` 컬럼을 정의하지만 `listNotices`/`getNoticeById` 가 이 컬럼을 where 절에 반영하지 않아 데드 컬럼 상태. 외부(VIEWER)·외주 직원이 NOTICE_READ 만 갖고도 인사 발표·내부 정책·민감 비즈니스 brief 등 INTERNAL `bodyMd` 전문을 응답으로 받을 수 있는 inside-workspace clearance 우회.
- 픽스: 신규 헬퍼 `canViewInternalNotice` + `INTERNAL_TIER_ROLES` (ADMIN/MANAGER/HR/DEVELOPER) 도입. 라우트에서 `session.roles` 로 계산해 `listNotices.canViewInternal` + `getNoticeById(id, ws, canViewInternal)` 로 주입. 미보유자는 PUBLIC 만 노출, INTERNAL detail 은 404 동등 처리. `updateNotice` 내부의 `getNoticeById` 호출은 caller 가 이미 NOTICE_UPDATE 권한 통과 상태이므로 `canViewInternal=true` 로 우회.
- 결정 근거: 새 PERMISSION 추가는 시드/마이그레이션까지 들어가야 하는 큰 변화 → 기존 role 코드 매핑으로 short-circuit. 외주(`employmentType=contractor`) 가 별개 신호이긴 하나 `JarvisSession` 에 미노출 — VIEWER role 매핑이 가장 가까운 프록시.
- 테스트: 회귀 9건 신설 (헬퍼 6 + listNotices where 분기 3 + getNoticeById INTERNAL/PUBLIC 분기 3). 총 9 pass.

### Phase 3 — 검증 게이트

| 게이트 | 회차 | 결과 |
|--------|------|------|
| `pnpm type-check` (cached) | 1 | 11/11 PASS, 20.7s |
| `pnpm type-check` (full cache hit) | 2 | 11/11 PASS, 0.16s |
| `pnpm turbo run type-check --force` | 3 | 11/11 PASS, 36.6s |
| `pnpm --filter @jarvis/web exec vitest run profile/codes/notices` | 1 | 15/15 PASS |
| (동일) | 2 | 15/15 PASS |
| (동일) | 3 | 15/15 PASS |
| `pnpm --filter @jarvis/web test` (전체) | 1 | 86 files / 566 tests PASS — 회귀 0 |
| `pnpm --filter @jarvis/web lint` | 1 | warnings only (모두 pre-existing) |
| `node scripts/check-schema-drift.mjs --precommit` | 1 | ✅ no drift |

### Phase 4 — 커밋

```
df7eba9 fix(notices): apply sensitivity filter to list/getById (P1 #10)
03264c4 fix(api/admin/codes): verify codeGroup workspace ownership on POST (P1 #9)
4872872 fix(actions/profile): require ADMIN_ALL for updateQuickMenuOrder (P1 #8)
34b6470 docs(plan): RBAC menu tree handoff — DB-driven sidebar/CommandPalette  ← 시작 baseline
```

3건 모두 main 에 직접 commit. push 는 사용자 결정.

## 감사에서 강등된 후보 (보고 X)

- **ask/route sensitivityScope ↔ wiki ACL 미세 부정합**: `deriveSensitivityScope` 가 `SECRET_REF_ONLY` 를 'secret' bucket(ADMIN_ALL only) 으로 매핑하지만 `resolveAllowedWikiSensitivities` 는 `PROJECT_ACCESS_SECRET` 도 허용. P1 #2 의 `permissionFingerprint` 가 cache key 에 들어가 있어 실제 누수 경로는 이미 차단됨 → 신뢰도 0.7 로 강등, 보고 제외.
- **admin/audit details 노출**: ADMIN_ALL 게이트가 정상이고 detail 노출은 의도된 audit 기능 → 제외.
- **admin/users/export passwordHash 누락 가능성**: 명시 화이트리스트 `select({…})` 사용 중 → 제외.

## 후속 task로 분리한 것

- **`updateQuickMenuOrder` per-user redesign**: 진짜 의도가 per-user "즐겨찾기 메뉴" 였다면 `user_quick_menu` 별도 테이블 신설 + `menu_item.sortOrder` 는 손대지 않는 것이 옳음. 본 PR 은 P1-class 차단만이라 ADMIN_ALL 게이트로 단기차단. 후속 design 안건.
- **`isOutsourced` 를 JarvisSession 에 노출**: P1 #10 픽스에서 role 기반 프록시로 short-circuit 했으나, 외주 인력이 DEVELOPER role 을 부여받는 케이스가 생기면 INTERNAL 노출됨. 정확한 차단을 위해 `employmentType` 또는 `isOutsourced` 를 session 에 주입 + notice 가드 강화. 후속 plan.
- **`NOTICE_READ_INTERNAL` PERMISSION 신설**: role 매핑 대신 명시 권한으로 바꾸는 것이 RBAC 모델 일관성에 부합. 마이그레이션 + 시드 동반 작업으로 별도 진행.

## Phase 5 — 전체 소스 종합 리뷰 (post-fix, 사용자 추가 지시)

`general-purpose` 에이전트로 비-보안 종합 리뷰 실행 (HEAD `10eb259` 기준).
결과: **15건 (HIGH 3 / MEDIUM 7 / LOW 5)**.

### 즉시 처리한 HIGH 2건

| ID | 카테고리 | 파일 | 커밋 |
|----|---------|------|------|
| HIGH G | 워커 idempotency | `apps/worker/src/jobs/aggregate-popular.ts` + `popular_search` UNIQUE migration | `1441023` |
| HIGH E | Wiki Karpathy / ACL projection 정합성 | `apps/web/app/(app)/wiki/manual/[workspaceId]/edit/[...path]/actions.ts` | `788cfb7` |

**HIGH G** — `onConflictDoNothing()` 가 PK(id) 기준으로만 conflict 를 잡아 중복 row 누적 + count freeze. (workspaceId, query, period) UNIQUE 인덱스 신설(migration 0048) + onConflictDoUpdate 로 교체 + currentWeekStart Date mutation 도 정리(LOW I 보너스). 회귀 테스트 5건 신설. popular_search 0건이라 backfill 불필요.

**HIGH E** — manual save 의 wikiPageIndex projection upsert 에서 set 에 `type/requiredPermission/publishedStatus` 누락 → frontmatter 권한 강화가 DB projection 에 반영 안 되는 ACL 우회. projectionColumns 객체로 insert/update 컬럼셋 통일. 회귀 테스트 1건 (강화 frontmatter 캡처).

### 사용자 결정 대기 항목 (autonomous 처리하지 않음)

- **HIGH B — page-first/tutor 폐기** (`packages/ai/page-first/*`, `packages/ai/tutor.ts`): Karpathy 피벗 직후 1주 burn-in 권장 (사용자 의도 확인 필요). 자동 삭제 보류. → 다음 plan
- **MEDIUM B — `KNOWLEDGE_ADMIN`/`AUDIT_READ`/`USER_WRITE` 권한 정리**: nominal-effective gap 해소 위해 라우트 게이트 추가 또는 PERMISSIONS 삭제. 변경 표면 큼.
- **MEDIUM B — `routes.ts` deprecated 표기**: RBAC 메뉴 트리 plan 진행 시 자연스럽게 처리.
- **MEDIUM C — ask-agent ToolDefinition 더블 캐스팅**: registry 패턴 도입 권장. 큰 리팩토링.
- **MEDIUM J — `company` 테이블 code lookup FK 누락**: 마이그레이션 + 시드 검증 필요.
- **MEDIUM F — i18n 누락 (additional-dev/holidays/contractors)**: `jarvis-i18n` 스킬 따라 일괄 작업 필요.
- **MEDIUM I — audit `.catch(() => undefined)` silent swallow**: console.error fallback 권장.
- **MEDIUM D — `ASK_SYSTEM_PROMPT`/`SYSTEM_PROMPT_PAGE_FIRST` deprecated const**: page-first 폐기와 묶음.
- **LOW (5건)**: wiki path normalization, aggregate-popular test 부재(이미 해결), repo root clutter (`_workspace_prev_*`, 미사용 PNG 등 + `jarvis_openai_key.txt` — git untracked + .gitignore 패턴 등록 확인됨, leak 아님), client type-only import.

### "전체 건강도" (리뷰어 의견)

> P1 #1~#10 직후라 보안 게이트는 견고. Karpathy 피벗으로 도입된 ask-agent 와 legacy page-first/tutor 가 공존 — prompt/sensitivity 가드가 두 경로에 분산. 데이터 무결성: company FK 누락 + (이번 PR 로 해결된) wiki manual projection set 누락. 워커는 대체로 idempotent — `aggregate-popular` 만 명백한 버그였고 이번에 처리. RBAC dictionary 는 정의-사용 mismatch 누적 (nominal vs effective gap).

→ **종합: healthy core, accumulated tech debt around legacy AI pipeline + RBAC nominal vs effective gap**.

### 권장 다음 cycle (리뷰어 우선순위)

1. ~~HIGH G aggregate-popular UPSERT~~ ✅ 완료 (`1441023`)
2. ~~HIGH E wiki manual projection 컬럼 보강~~ ✅ 완료 (`788cfb7`)
3. **HIGH B page-first/tutor 폐기** — 1주 burn-in 후 폴더·exports·테스트·deprecated const 일괄 삭제
4. **MEDIUM B routes.ts ↔ menu_tree 마이그레이션 plan 진행** — 사이드바 분리 commit 누적 전에
5. **MEDIUM J + B company FK + dead permission 정리** — 같은 마이그레이션에 묶어서

## 최종 commit 시퀀스

```
788cfb7 fix(wiki/manual): include type/requiredPermission/publishedStatus in onConflictDoUpdate.set (review HIGH E)
1441023 fix(worker/aggregate-popular): proper UPSERT + UNIQUE on (ws, query, period) (review HIGH G)
10eb259 docs(handoff): record P1 #8/#9/#10 security re-audit + fixes
df7eba9 fix(notices): apply sensitivity filter to list/getById (P1 #10)
03264c4 fix(api/admin/codes): verify codeGroup workspace ownership on POST (P1 #9)
4872872 fix(actions/profile): require ADMIN_ALL for updateQuickMenuOrder (P1 #8)
34b6470 docs(plan): RBAC menu tree handoff — DB-driven sidebar/CommandPalette  ← 시작 baseline
```

총 5건 픽스 + 1건 핸드오프 doc. Push 는 사용자 결정.
