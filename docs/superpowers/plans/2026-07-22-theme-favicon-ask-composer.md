# Jarvis Theme, Favicon, and Ask Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capybara favicon, 3색 브랜드 테마, Light/Dark 모드, Codex형 질문 composer를 현재 공개 Jarvis에 추가한다.

**Architecture:** 현재 CSS 변수 계약과 Ask SSE 계약은 유지한다. 테마 설정은 작은 client preference 모듈이 localStorage와 `<html>` data attribute를 동기화하고, Root layout의 bootstrap script가 hydration 전에 저장값을 적용한다. 질문 키보드 판별은 순수 함수로 분리해 TDD로 고정한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, next-intl, Vitest, Playwright

## Global Constraints

- 기본 테마는 `light + blue`다.
- 브랜드 색상은 Blue `#2D8CDB`, Forest Green `#176B4D`, Premium Red `#A33A3A` 세 가지뿐이다.
- `Enter`는 전송, `Shift+Enter`는 줄바꿈이며 IME 조합 중 Enter는 전송하지 않는다.
- 기존 API, SSE, DB, 세션, 권한, Wiki 및 LLM 호출 경로는 변경하지 않는다.
- 기존 미추적 `.agents/`, `.worktrees/`는 수정하거나 커밋하지 않는다.
- 구현 완료 후 `main`에 직접 푸시한다.

## 영향도 체크

- DB 스키마, Validation, 권한, 세션, workspaceId, Ask agent, Wiki-fs, 검색, server action/API, worker, LLM budget, audit: 해당 없음.
- 서버 UI: Root metadata와 theme bootstrap만 변경.
- Client UI: Topbar theme control, GridBackground theme refresh, AskPanel composer 변경.
- i18n: `Theme`, `Ask.Composer` 한국어 키 추가.
- 테스트: theme preference 및 keyboard unit test, Ask E2E 보강.

---

### Task 1: 테마 설정 계약

**Files:**
- Create: `apps/web/components/layout/theme-config.ts`
- Create: `apps/web/components/layout/theme-config.test.ts`
- Create: `apps/web/components/layout/uiPrefs.ts`
- Create: `apps/web/components/layout/uiPrefs.test.ts`

**Interfaces:**
- Produces: `ThemeMode`, `ThemeColorId`, `THEME_COLORS`, `DEFAULT_THEME`, `DEFAULT_THEME_COLOR`, `resolveTheme`, `resolveThemeColor`, `UI_PREFS_BOOTSTRAP`
- Produces: `setTheme`, `setThemeColor`, `useTheme`, `useThemeColor`

- [ ] **Step 1: 기본값과 허용 색상에 대한 failing unit test 작성**

```ts
expect(THEME_COLORS.map(({ id }) => id)).toEqual(["blue", "forest", "red"]);
expect(resolveTheme("dark")).toBe("dark");
expect(resolveTheme("invalid")).toBe("light");
expect(resolveThemeColor("forest")).toBe("forest");
expect(resolveThemeColor("invalid")).toBe("blue");
```

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @jarvis/web exec vitest run components/layout/theme-config.test.ts`

Expected: `theme-config.ts`가 없어 FAIL.

- [ ] **Step 3: theme config 최소 구현**

세 색상과 localStorage key, fallback 함수, `<html data-theme data-theme-color>`를 설정하는 bootstrap script를 구현한다. localStorage 예외는 무시하고 기본값을 사용한다.

- [ ] **Step 4: 설정 쓰기 동작에 대한 failing unit test 작성**

```ts
setTheme("dark");
expect(localStorage.getItem("jv.theme")).toBe("dark");
expect(document.documentElement.dataset.theme).toBe("dark");

setThemeColor("red");
expect(localStorage.getItem("jv.themeColor")).toBe("red");
expect(document.documentElement.dataset.themeColor).toBe("red");
```

두 setter가 `jv:theme-change`, `jv:theme-color-change` event를 각각 한 번 발행하는지도 검증한다.

- [ ] **Step 5: RED 확인 후 uiPrefs 구현**

Run: `pnpm --filter @jarvis/web exec vitest run components/layout/uiPrefs.test.ts`

Expected: `uiPrefs.ts`가 없어 FAIL. 이후 setter와 SSR-safe hook을 구현하고 같은 명령이 PASS하는지 확인한다.

---

### Task 2: 전역 테마 UI와 Canvas 동기화

**Files:**
- Create: `apps/web/components/layout/ThemeControls.tsx`
- Modify: `apps/web/components/layout/Topbar.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/background/GridBackground.tsx`
- Modify: `apps/web/messages/ko.json`

**Interfaces:**
- Consumes: Task 1의 theme config와 preference hooks
- Produces: Topbar의 3색 radio group, Light/Dark toggle, hydration 전 테마 복원, Canvas 즉시 색상 갱신

- [ ] **Step 1: i18n 키 추가**

```json
"Theme": {
  "pickerLabel": "테마 색상",
  "colors": {
    "blue": "블루",
    "forest": "포레스트 그린",
    "red": "프리미엄 레드"
  },
  "switchToDark": "다크 모드로 전환",
  "switchToLight": "라이트 모드로 전환"
}
```

- [ ] **Step 2: Light/Dark와 브랜드 CSS 토큰 구현**

기존 token 이름을 유지하고 `:root[data-theme-color=...]`에서 brand 두 토큰을, `:root[data-theme=dark]`에서 배경·표면·전경·테두리·그림자를 재정의한다. `color-scheme`도 현재 모드와 일치시킨다.

- [ ] **Step 3: ThemeControls 구현 및 Topbar 배치**

세 swatch는 `role="radiogroup"`/`role="radio"`, `aria-checked`, label, focus ring을 제공한다. 달/해 버튼은 `aria-pressed`와 현재 상태에 맞는 번역 label을 사용한다. 기존 UserMenu는 그대로 둔다.

- [ ] **Step 4: hydration 전 bootstrap 적용**

Root `<html>`에 `suppressHydrationWarning`을 설정하고 `UI_PREFS_BOOTSTRAP`을 body보다 먼저 실행한다.

- [ ] **Step 5: Canvas theme refresh 구현**

`GridBackground`가 `data-theme`, `data-theme-color` mutation을 관찰하고 `readColors → rebuild → draw`를 호출하게 한다. cleanup에서 observer를 disconnect한다.

- [ ] **Step 6: web type-check로 계약 확인**

Run: `pnpm --filter @jarvis/web type-check`

Expected: exit code 0.

---

### Task 3: 질문 키보드 계약과 Composer

**Files:**
- Create: `apps/web/components/ai/ask-keyboard.ts`
- Create: `apps/web/components/ai/ask-keyboard.test.ts`
- Modify: `apps/web/components/ai/AskPanel.tsx`
- Modify: `apps/web/messages/ko.json`
- Modify: `apps/web/e2e/ask-citation.spec.ts`

**Interfaces:**
- Produces: `shouldSubmitQuestion(event: AskKeyboardEvent): boolean`
- Consumes: 기존 `submit()`과 SSE state

- [ ] **Step 1: 키보드 판별 failing unit test 작성**

```ts
expect(shouldSubmitQuestion({ key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, isComposing: false })).toBe(true);
expect(shouldSubmitQuestion({ key: "Enter", shiftKey: true, ctrlKey: false, metaKey: false, isComposing: false })).toBe(false);
expect(shouldSubmitQuestion({ key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, isComposing: true })).toBe(false);
expect(shouldSubmitQuestion({ key: "a", shiftKey: false, ctrlKey: false, metaKey: false, isComposing: false })).toBe(false);
```

Ctrl/Meta+Enter도 false로 검증한다.

- [ ] **Step 2: RED 확인**

Run: `pnpm --filter @jarvis/web exec vitest run components/ai/ask-keyboard.test.ts`

Expected: helper가 없어 FAIL.

- [ ] **Step 3: 최소 helper 구현 및 GREEN 확인**

조건은 `Enter && !shiftKey && !ctrlKey && !metaKey && !isComposing` 하나만 사용한다. 같은 test 명령이 PASS해야 한다.

- [ ] **Step 4: Ask composer i18n 추가**

`Ask.Composer` 아래 `label`, `placeholder`, `hint`, `submit`, `submitting`, `failed`를 추가하고 모든 새 사용자 노출 문자열은 `useTranslations("Ask.Composer")`를 통해 읽는다.

- [ ] **Step 5: AskPanel composer 구현**

기존 fetch/SSE 코드는 유지한다. textarea `onKeyDown`에서 helper가 true이면 `preventDefault()` 후 `submit()`을 호출한다. UI는 composer panel, keyboard hint, icon send button으로 변경한다.

- [ ] **Step 6: E2E 계약 보강**

기존 mock SSE test에서 버튼 click 대신 textarea에 질문을 채우고 `Enter`로 전송한다. 별도 test에서는 `Shift+Enter` 후 textarea value가 줄바꿈을 포함하고 API 요청이 발생하지 않았음을 검증한다.

---

### Task 4: Capybara favicon

**Files:**
- Create: `apps/web/public/capybara/basic.png`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: 참조 저장소 `apps/web/public/capybara/basic.png`
- Produces: metadata icon `/capybara/basic.png`

- [ ] **Step 1: 이미지 복사와 hash 확인**

원본과 대상의 SHA-256이 동일해야 한다.

- [ ] **Step 2: metadata icon 지정**

```ts
icons: {
  icon: [{ url: "/capybara/basic.png", type: "image/png" }],
  apple: [{ url: "/capybara/basic.png", type: "image/png" }],
}
```

- [ ] **Step 3: favicon route 포함 production build 확인**

Run: `pnpm --filter @jarvis/web build`

Expected: build 성공, exit code 0.

---

### Task 5: 최종 검증 및 main push

**Files:**
- Modify: 이 계획의 구현 파일만

**Interfaces:**
- Produces: 검증된 `main` commit과 `origin/main` push

- [ ] **Step 1: 관련 unit test 실행**

Run: `pnpm --filter @jarvis/web exec vitest run components/layout/theme-config.test.ts components/layout/uiPrefs.test.ts components/ai/ask-keyboard.test.ts`

Expected: 모두 PASS.

- [ ] **Step 2: web 정적 검사 실행**

Run: `pnpm --filter @jarvis/web type-check` 및 `pnpm --filter @jarvis/web lint`

Expected: 둘 다 exit code 0.

- [ ] **Step 3: diff 범위 확인**

Run: `git diff --check` 및 `git status --short`

Expected: 이번 작업 파일만 stage하며 `.agents/`, `.worktrees/`는 untracked 상태로 남긴다.

- [ ] **Step 4: 커밋 및 push**

```bash
git add docs/superpowers/plans/2026-07-22-theme-favicon-ask-composer.md apps/web/app/layout.tsx apps/web/app/globals.css apps/web/components/layout/theme-config.ts apps/web/components/layout/theme-config.test.ts apps/web/components/layout/uiPrefs.ts apps/web/components/layout/uiPrefs.test.ts apps/web/components/layout/ThemeControls.tsx apps/web/components/layout/Topbar.tsx apps/web/components/background/GridBackground.tsx apps/web/components/ai/ask-keyboard.ts apps/web/components/ai/ask-keyboard.test.ts apps/web/components/ai/AskPanel.tsx apps/web/messages/ko.json apps/web/e2e/ask-citation.spec.ts apps/web/public/capybara/basic.png
git commit -m "feat: add themes and improve Ask composer"
git push origin main
```
