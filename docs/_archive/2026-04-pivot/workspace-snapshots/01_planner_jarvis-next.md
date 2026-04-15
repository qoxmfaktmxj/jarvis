# Jarvis Next — Planner Output

> 원본 계획: `docs/plan/2026-04-13-jarvis-next.md`  
> 상태: 빌더 실행 준비 완료

## 실행 순서 (의존성 순)

### Phase 0: DB Schema (최우선)

**0-1. knowledge_page 컬럼 추가**
- 파일: `packages/db/schema/knowledge.ts`
- 추가 컬럼: surface, authority, ownerTeam, audience, reviewCycleDays, domain, sourceOrigin
- 타입: varchar + integer, 모두 nullable 또는 default 있음

**0-2. packages/db/schema/case.ts 신규**
- 테이블: precedent_case, case_cluster
- 의존: workspace(tenant.ts), knowledgePage(knowledge.ts), user(user.ts)
- vector 타입 재사용 (knowledge.ts와 동일 customType)

**0-3. packages/db/schema/directory.ts 신규**
- 테이블: directory_entry
- 의존: workspace(tenant.ts)

**0-4. schema/index.ts export 추가**
- 파일: `packages/db/schema/index.ts`
- 신규 export: case.ts, directory.ts 모두 추가

**0-5. Drizzle Migration 생성**
- `cd packages/db && pnpm drizzle-kit generate`
- 생성 파일: `packages/db/drizzle/0005_knowledge_surfaces_and_cases.sql`

### Phase 3: AI Router (Phase 0 완료 후)

**3-1. packages/ai/router.ts 신규**
**3-2. packages/ai/case-context.ts 신규**
**3-3. packages/ai/directory-context.ts 신규**
**3-4. packages/ai/types.ts SourceRef 확장**
**3-5. packages/ai/ask.ts 리팩터링**

### Phase 4: OpenAI 마이그레이션 (Phase 3 완료 후)
**4-1~4-3. ask.ts + env**

### Phase 1: Guidebook (독립 작업)
**1-1. scripts/canonicalize-guidebook.ts**

### Phase 5: UI (Phase 3 완료 후)
**5-1~5-2. AnswerCard + SourceRef 렌더러**

## 체크포인트
- [ ] 0005 migration 파일 생성 확인
- [ ] `pnpm --filter @jarvis/db type-check` OK
- [ ] `pnpm --filter @jarvis/ai type-check` OK
- [ ] `pnpm --filter @jarvis/web type-check` OK
- [ ] `pnpm lint` OK
