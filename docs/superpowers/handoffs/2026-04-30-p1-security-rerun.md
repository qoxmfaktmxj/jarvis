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

## 다음 단계 (대기)

- task #4: 전체 소스 코드 리뷰 (post-fix). 보안 외 일반 품질(아키텍처 일관성, 데드 코드, 타입 안전성, RSC 경계, 위키 Karpathy 원칙 준수, i18n 누락, 워커 잡 idempotency 등) 종합 리뷰.
