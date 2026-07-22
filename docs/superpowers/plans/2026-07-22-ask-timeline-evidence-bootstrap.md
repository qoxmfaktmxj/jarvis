# Ask Timeline and Evidence Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask AI를 단일 대화 타임라인과 하단 입력창 구조로 고치고, 최초 배포에서 샘플 근거 Wiki가 비어 있는 상태를 자동 복구한다.

**Architecture:** 서버는 소유권이 검증된 대화 메시지를 직렬화해 `AskPanel`에 전달하고, 클라이언트는 기존 이력·현재 질문·스트리밍 답변을 같은 스크롤 타임라인에서 렌더링한다. API와 엄격한 인용 정책은 유지한다. 배포 스크립트는 runtime Wiki가 비어 있을 때만 기존 샘플 ingest/bootstrap/project 명령을 실행한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, next-intl, Tailwind CSS 4, Vitest, Playwright, Bash

## 영향도 체크

- DB 스키마, Validation, 권한, 세션, workspaceId, Ask agent, 검색, API, LLM 호출, Audit: 변경 없음.
- Wiki-fs: 코드 변경 없음. 기존 공개 샘플의 최초 runtime bootstrap 호출만 배포 스크립트에 연결.
- UI 라우트/컴포넌트: `/ask`, `/ask/[conversationId]`, `AskPanel`, 대화 목록 변경.
- i18n: Ask 대화 목록·빈 화면·응답 상태 문자열 추가.
- 테스트: Ask E2E 회귀 테스트와 배포 스크립트 구문 검증.

---

### Task 1: 대화 타임라인 회귀 테스트

**Files:**
- Modify: `apps/web/e2e/ask-citation.spec.ts`

- [x] 전송 직후 입력창이 비워지고 사용자 질문 다음에 AI 답변이 표시되는 테스트를 작성한다.
- [x] DB 없는 환경에서도 실행되는 `AskPanel.test.tsx`로 기존 UI의 RED를 확인한다. Playwright는 `DATABASE_URL` 부재로 fixture 단계에서 중단됨을 기록한다.

### Task 2: Ask UI 정상화

**Files:**
- Modify: `apps/web/components/ai/AskPanel.tsx`
- Modify: `apps/web/components/ai/AnswerCard.tsx`
- Modify: `apps/web/app/(app)/ask/page.tsx`
- Modify: `apps/web/app/(app)/ask/[conversationId]/page.tsx`
- Modify: `apps/web/app/(app)/ask/_components/ConversationList.tsx`
- Delete: `apps/web/app/(app)/ask/_components/ConversationView.tsx`
- Modify: `apps/web/messages/ko.json`

- [x] 기존 이력과 라이브 메시지를 하나의 스크롤 타임라인으로 렌더링한다.
- [x] 전송 전에 질문을 별도 보관하고 입력창을 즉시 비운다.
- [x] 입력창은 하단에 유지하고 레거시 Jarvis의 절제된 빈 화면과 메시지 흐름을 적용한다.
- [x] 동일 회귀를 검증하는 컴포넌트 테스트를 다시 실행해 GREEN을 확인한다.

### Task 3: 최초 배포 근거 데이터 초기화

**Files:**
- Modify: `scripts/deploy-openclaw.sh`

- [x] `.runtime/wiki-repo`에 Markdown이 없을 때만 `samples:ingest`, `wiki:bootstrap`, `wiki:project`를 순서대로 실행한다.
- [x] Git Bash의 `bash -n scripts/deploy-openclaw.sh`로 구문을 검증한다.

### Task 4: 범위 검증

- [x] Ask 관련 단위 테스트를 실행한다.
- [x] `pnpm --filter @jarvis/web type-check`와 `pnpm --filter @jarvis/web lint`를 실행한다.
- [x] 변경 파일과 미추적 사용자 파일이 섞이지 않았는지 `git status --short`로 확인한다.
