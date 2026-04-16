# shadcn/ui + Radix 대규모 리팩토링 설계

- **Status**: Approved
- **Date**: 2026-04-17
- **Owner**: Design System / Frontend
- **Goal**: Impeccable 디자인 스킬 기준 95+ 점 도달. 접근성(WCAG AA) 준수. `components/ui/` 전면 교체 + Jarvis 고유 패턴 레이어 도입 + 모든 페이지 일관 적용.
- **Strategy**: Big Bang (단일 PR로 인프라 + 22개 primitives + 8개 patterns + 15+ 페이지 + a11y 인프라 동시 교체).

---

## 1. 배경

### 1.1 현재 상태
- `components/ui/` 하위 22개 컴포넌트: shadcn API를 **모방한 custom 구현** (Radix 미사용). 예: `tooltip.tsx`는 `<>{children}</>`만 반환. 접근성 제공 없음.
- 기존 5개 컴포넌트(card, button, badge, input, 기타)만 ISU 브랜드 토큰으로 업데이트됨. 나머지 17개는 Tailwind 기본색 사용 → 브랜드 일관성 구멍.
- 디자인 토큰: `apps/web/app/globals.css`에 `@theme` 기반 OKLCH ISU 팔레트 완성.
- 레이아웃(Sidebar, Topbar, AppShell) + PageHeader 이미 브랜드 시그니처 적용 완료.

### 1.2 Impeccable 현재 점수
- 초기 36/100 → 1차 개선 58 → 2차 병렬 개선 **82/100**.
- 남은 격차: 브랜드 일관성 (17개 ui 미적용), 접근성, 페이지 헤더 일관성, "어떻게 만들었지?"급 시그니처 부족.

### 1.3 의사결정 맥락
- **Approach B 채택**: "shadcn 기반 + Jarvis 커스텀 레이어". A(표준 shadcn + 토큰)는 천장 85-90, C(from scratch)는 2-3배 공수. B는 균형점.
- **Big Bang 채택**: 사용자 명시적 선택. Phase 분리 없이 단일 PR.

---

## 2. 목표 및 Non-Goals

### Goals
1. `components/ui/`를 실제 shadcn/Radix 기반으로 **전면 교체**. 모든 primitives가 Radix 접근성 이점(포커스 트랩, 키보드 내비, ARIA)을 상속.
2. `components/patterns/` 신설: Jarvis 고유 재사용 단위 8개 (PageHeader, EmptyState, KpiTile, StatRow, DataTableShell, TimelineItem, SectionHeader, StatusDot).
3. 15+ 페이지의 consumer 코드를 신규 primitives/patterns에 맞게 업데이트.
4. 접근성 인프라: `@axe-core/react` (dev), `eslint-plugin-jsx-a11y` (CI lint gate), `focus-visible` ring 전역 적용.
5. 핵심 5화면 Playwright 시각 회귀 테스트.
6. 모션 토큰 도입 + `prefers-reduced-motion` 지원.
7. Impeccable 재평가 95+ 점 달성.

### Non-Goals
- 다크 모드 도입 (follow-up).
- 모바일 네비 패턴 전면 재설계 (현재 `(app)/layout.tsx` 기반 유지).
- 신규 기능 추가. 순수 UI/접근성 리팩토링.
- 백엔드 API 변경.
- 기존 드리즐 스키마 변경.

---

## 3. 아키텍처

### 3.1 경계

```
globals.css  (@theme: colors, motion, radius, spacing)
        │
        ├─▶ components/ui/*   (shadcn + Radix primitives, 22개)
        │
        ├─▶ components/patterns/*  (Jarvis 재사용 단위, 8개 신규)
        │        ↓ consumes ui/
        │
        ├─▶ components/layout/*  (Sidebar, Topbar, AppShell, PageHeader, UserMenu)
        │        ↓ consumes ui/
        │
        └─▶ app/(app)/**, (auth)/**  (15+ 페이지)
                 ↓ consumes patterns/ + ui/ + layout/
```

**이동 원칙:**
- `ui/`: Radix 표준. 변경 최소화. shadcn CLI로 설치 후 ISU 토큰 주입만.
- `patterns/`: Jarvis 고유. 여기에 디자인 차별성 집중.
- `layout/`: 이미 완성 — `PageHeader.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `AppShell.tsx`, `UserMenu.tsx` 건드리지 않음.

### 3.2 파일 트리 (리팩토링 후)

```
apps/web/
├─ components.json                     [신규] shadcn config
├─ app/globals.css                     [수정] motion 토큰 추가
├─ components/
│  ├─ ui/                              [전면 교체] 22개 파일
│  ├─ patterns/                        [신규] 8개 파일
│  │  ├─ PageHeader.tsx (기존 layout/에서 이동)
│  │  ├─ EmptyState.tsx
│  │  ├─ KpiTile.tsx
│  │  ├─ StatRow.tsx
│  │  ├─ DataTableShell.tsx
│  │  ├─ TimelineItem.tsx
│  │  ├─ SectionHeader.tsx
│  │  └─ StatusDot.tsx
│  └─ layout/                          [유지]
│     ├─ Sidebar.tsx
│     ├─ Topbar.tsx
│     ├─ AppShell.tsx
│     └─ UserMenu.tsx
├─ lib/
│  └─ a11y/
│     └─ axe-init.tsx                  [신규] dev 전용 axe-core 로더
├─ e2e/                                [신규 or 확장]
│  ├─ playwright.config.ts
│  └─ screens/
│     ├─ dashboard.spec.ts
│     ├─ login.spec.ts
│     ├─ knowledge-detail.spec.ts
│     ├─ admin-users.spec.ts
│     └─ project-detail.spec.ts
└─ package.json                        [수정] 신규 의존성
```

### 3.3 의존성 변경

**추가:**
- Radix primitives (17):
  - `@radix-ui/react-accordion`
  - `@radix-ui/react-alert-dialog`
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-dropdown-menu`
  - `@radix-ui/react-label`
  - `@radix-ui/react-popover`
  - `@radix-ui/react-scroll-area`
  - `@radix-ui/react-select`
  - `@radix-ui/react-separator`
  - `@radix-ui/react-slot`
  - `@radix-ui/react-switch`
  - `@radix-ui/react-tabs`
  - `@radix-ui/react-toast`
  - `@radix-ui/react-tooltip`
  - `@radix-ui/react-avatar`
  - `@radix-ui/react-checkbox`
  - `@radix-ui/react-radio-group`
- Calendar: `react-day-picker`
- Utils: `cmdk` (커맨드 팔레트용, 선택)
- Tests: `@axe-core/react`, `@axe-core/playwright`, `eslint-plugin-jsx-a11y`

**이미 존재 (검증 완료):**
- `react-hook-form@^7.54.2`, `@hookform/resolvers@^3.9.1`, `zod@^3.24.1` — form stack 재사용
- `date-fns@^3.6.0` — calendar에서 사용
- `@playwright/test@^1.44.0` — E2E infra 재사용
- `lucide-react` — icon
- `class-variance-authority`, `clsx`, `tailwind-merge` — shadcn 필수 유틸

**제거 대상:** 없음 (기존 `class-variance-authority`, `clsx`, `tailwind-merge` 모두 유지).

---

## 4. 구성 요소 상세

### 4.1 `components/ui/` — shadcn 표준

각 컴포넌트는 shadcn CLI로 설치 후 ISU 토큰 치환만 수행. 기본 variants는 shadcn 기본값 유지하되, 브랜드 variants 추가:

- **Button**: `variant: default|destructive|outline|secondary|ghost|link` + 신규 `accent` (lime primary)
- **Badge**: `variant: default|secondary|destructive|outline` + 신규 `success`, `warning`, `accent`
- **Alert**: `variant: default|destructive` + 신규 `warning`, `success` — **좌측 스트라이프 금지**. icon + bg-tint 패턴.
- **Tooltip**: Radix tooltip, `delayDuration={200}`, `sideOffset={4}`
- **Dialog**: Radix dialog, 포커스 트랩, `aria-labelledby` 자동

### 4.2 `components/patterns/` — Jarvis 고유

#### PageHeader (이동)
`components/layout/PageHeader.tsx` → `components/patterns/PageHeader.tsx`. API 유지.

#### EmptyState
```tsx
type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};
```
표시 영역에 여백 + 희미한 ISU 배경색 + 중앙 정렬 + action slot. "빈 상태를 가르치는" UX 원칙 준수.

#### KpiTile
```tsx
type KpiTileProps = {
  label: string;
  value: string | number;
  trend?: { direction: "up" | "down" | "flat"; pct: number };
  accent?: "brand" | "lime" | "surface";
  footnote?: string;
};
```
display 폰트 + 거대 숫자 + 선택적 추세 chip. Dashboard, Admin 메트릭 등에서 재사용.

#### StatRow
```tsx
type StatRowProps = {
  items: Array<{ label: string; value: string | number; emphasis?: "normal" | "success" | "warning" | "danger" }>;
  align?: "left" | "right";
};
```
수평 배치된 여러 지표 (현재 AttendanceSummaryWidget의 4열 dl 패턴을 일반화).

#### DataTableShell
```tsx
type DataTableShellProps = {
  children: ReactNode;       // <Table> from ui/
  pagination?: ReactNode;
  filters?: ReactNode;
  empty?: ReactNode;
  isLoading?: boolean;
};
```
Admin 페이지들이 공통으로 쓰는 테이블 + 필터 + 페이징 컨테이너. `isLoading` 시 skeleton 자동.

#### TimelineItem
```tsx
type TimelineItemProps = {
  time: string;            // formatted
  title: string;
  description?: string;
  meta?: ReactNode;
};
```
현재 RecentActivityWidget의 timeline 패턴을 추출. dot marker + left time column + right content.

#### SectionHeader
```tsx
type SectionHeaderProps = {
  title: string;            // "SEARCH TRENDS" 등 uppercase label 느낌
  children?: ReactNode;     // 우측 meta (count, link 등)
};
```
현재 대시보드 위젯들의 `h2 + flex-1 bg-surface-200` 패턴을 추출.

#### StatusDot
```tsx
type StatusDotProps = {
  tone: "healthy" | "warning" | "danger" | "info" | "neutral";
  label?: string;            // 있으면 우측 텍스트 표시
  size?: "sm" | "md";
};
```
AttendanceWidget의 healthy/attention 닷 패턴.

### 4.3 인프라: 접근성

#### `lib/a11y/axe-init.tsx`
```tsx
"use client";
import { useEffect } from "react";
export function AxeInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const ReactDOM = require("react-dom/client");
      require("@axe-core/react")(React, ReactDOM, 1000);
    }
  }, []);
  return null;
}
```
`app/layout.tsx`의 `<body>`에 마운트. 개발 중에만 axe 경고가 브라우저 콘솔에 출력.

#### `eslint-plugin-jsx-a11y`
- 루트 ESLint 설정에 추가
- 규칙: `recommended` preset 활성화 + `no-autofocus: error`
- CI gate: `pnpm lint` 실패 시 merge 블록

### 4.4 인프라: 모션

`globals.css`의 `@theme`에 추가:
```css
@theme {
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 240ms;
  --duration-slow: 400ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms !important;
    --duration-normal: 0ms !important;
    --duration-slow: 0ms !important;
  }
  *, *::before, *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```
Tailwind 유틸리티: `duration-fast`, `duration-normal`, `duration-slow`가 자동 생성.

### 4.5 인프라: Playwright

`apps/web/e2e/`:
- 5화면 snapshot: login, dashboard, knowledge detail, admin users, project detail
- CI: push 시 실행, 시각 차이 발생 시 PR에 diff 업로드

---

## 5. 실행 계획 (Big Bang)

### Phase 0 — 인프라 준비 (직렬, 주 클로드 직접)
1. `pnpm` 의존성 추가 — **신규만**: Radix 17개, `react-day-picker`, `@axe-core/react`, `@axe-core/playwright`, `eslint-plugin-jsx-a11y`, (옵션) `cmdk`. form/zod/date-fns/playwright는 기존 사용.
2. `pnpm dlx shadcn@latest init` 실행 → `components.json` 생성. ISU 토큰/스타일에 맞게 `tailwind.config` 대신 `globals.css` @theme을 사용하도록 세팅 (Tailwind v4).
3. `globals.css`에 motion 토큰 추가 + `prefers-reduced-motion` 쿼리.
4. `lib/a11y/axe-init.tsx` 생성 + `app/layout.tsx`에 마운트 (dev 전용 가드).
5. `eslint-plugin-jsx-a11y` 추가 + ESLint config 업데이트.
6. Playwright config이 이미 있다면 E2E 디렉토리 추가만; 없다면 초기화.

### Phase 1 — ui/ 22개 교체 (병렬 4-agent)
- **Agent α** (6개, 기초): accordion, alert, badge, button, card, label.
- **Agent β** (6개, 오버레이): dialog, dropdown-menu, popover, select, sheet, tooltip.
- **Agent γ** (8개, 폼+데이터+기타): form, input, textarea, table, tabs, scroll-area, separator, skeleton.
- **Agent δ** (1개, 특수): calendar (react-day-picker 설정 무거움).

각 agent 입력:
- `components.json` 내용
- `globals.css` 토큰 리스트
- 기존 custom 컴포넌트의 API 시그니처 (consumer 코드가 의존 중이므로 호환 유지 요구)
- ISU variant 요구사항 (badge의 accent, alert의 warning/success 등)
- 절대금지 패턴 (좌측 스트라이프, gradient text, inline style)

### Phase 2 — patterns/ 8개 신설 (병렬 2-agent)
- **Agent ε**: PageHeader(이동), EmptyState, SectionHeader, StatusDot.
- **Agent ζ**: KpiTile, StatRow, DataTableShell, TimelineItem.

### Phase 3 — 페이지 consumer 업데이트 (병렬 5-agent)
- **Agent η**: `(app)/dashboard` (나머지), `(app)/profile`, `(app)/attendance`.
- **Agent θ**: `(app)/projects/**`, `(app)/systems/**`.
- **Agent ι**: `(app)/knowledge/**`, `(app)/notices/**`, `(app)/wiki/**`, `(app)/search`, `(app)/ask/**`.
- **Agent κ**: `(app)/admin/**` (15개 sub-페이지).
- **Agent λ**: `(auth)/login`, `forbidden.tsx`, error boundaries.

각 agent 입력:
- patterns/ + ui/ API 명세
- PageHeader accent 매핑 규칙 (대부분 `W${weekNumber}`, Admin은 `AD`, Auth는 없음)
- 금지 패턴 + i18n 키 보존 규칙

### Phase 4 — 테스트 (병렬 1-agent + 수동)
- **Agent μ**: Playwright 5화면 spec 작성 + baseline snapshot 생성 + axe runner 포함 테스트.
- 주 클로드: `pnpm build`, `pnpm lint`, `pnpm test` 실행 및 오류 수정.

### Phase 5 — 최종 검증 (직렬)
- 시각 차이 수동 점검 (baseline snapshot 리뷰).
- Impeccable 재평가 수행.
- 95+ 점 미달 시 follow-up 리스트 정리.

---

## 6. 위험 및 완화

| 위험 | 영향 | 완화책 |
|------|------|--------|
| Radix 설치로 번들 크기 증가 | 초기 로드 시간 +100-200KB | Next.js 자동 코드 스플리팅 + `next/dynamic`으로 Dialog 등 onDemand 로딩 |
| shadcn API가 기존 custom과 비호환 → 페이지 대량 수정 | 스코프 폭증 | Phase 1에서 각 ui 컴포넌트에 **어댑터 레이어 금지, 대신 consumer 페이지도 수정**. Big Bang 단일 PR 전제 유지. |
| i18n 키 실수로 누락/삭제 | 빌드 실패 | agent 프롬프트에 "기존 키만 사용, 신규 키 금지" 명시 + 최종 검증 단계에 `scripts/check-i18n.mjs` 실행 |
| Playwright 시각 회귀 false positive (폰트 로딩 타이밍 등) | CI 불안정 | `await page.waitForLoadState("networkidle")` + 폰트 프리로드 |
| axe-core가 production 빌드에 들어감 | 번들 오염 | `NODE_ENV !== "production"` 가드 + 동적 require로 트리 쉐이킹 |
| pnpm workspace 내 타입 경로 누락 | tsc 에러 | 기존 `apps/web/tsconfig.json` 유지, 수정 시 즉시 `pnpm -F web typecheck` |

---

## 7. 테스트 전략

### 7.1 자동화
- **Lint**: `eslint` + `jsx-a11y` → `pnpm lint` 게이트.
- **Typecheck**: `tsc --noEmit` → `pnpm -F web typecheck`.
- **Unit**: 기존 `__tests__` 유지 (대부분 쿼리/유틸리티).
- **E2E 시각 회귀**: Playwright 5화면 baseline.
- **Axe 접근성**: Playwright 테스트 내 `axe-core/playwright` 러너로 각 화면 스캔 → violations 0.

### 7.2 수동
- 키보드 내비 (Tab, Shift+Tab, Esc, Arrow) 주요 화면 5개.
- Screen reader pass (VoiceOver / NVDA 샘플링).
- `prefers-reduced-motion: reduce` OS 설정 on 상태에서 확인.

---

## 8. 성공 기준

- [ ] 22개 `components/ui/` 모두 Radix 기반.
- [ ] 8개 `components/patterns/` 신설 및 적어도 2곳 이상에서 재사용.
- [ ] 15+ 페이지 모두 `PageHeader` 적용.
- [ ] `pnpm build` + `pnpm lint` + `pnpm test` 통과.
- [ ] Playwright 5화면 baseline 통과.
- [ ] Axe violations count = 0.
- [ ] Impeccable 재평가 총점 95+.
- [ ] 번들 크기 증가 +250KB 이하 (압축 기준).

---

## 9. 롤백 전략

- 단일 PR이므로 merge 후 문제 시 revert로 즉시 이전 상태 복구.
- 리팩토링 중 partial failure 시 해당 agent의 결과물만 드롭하고 재시도.
- 의존성 추가로 인한 `node_modules` 재설치 필요 시 `pnpm install --frozen-lockfile=false`.

---

## 10. 이후 할 일 (Out of Scope but Tracked)

- 다크 모드 토큰 세트 + 토글 UI.
- 고대비 테마 (WCAG AAA 선택형).
- 애니메이션 policy 문서 (motion.md).
- 한국어 폰트 vertical rhythm 미세 조정 (Hahmlet 실전 평가 후).
- 프리뷰용 Storybook 도입 검토.
