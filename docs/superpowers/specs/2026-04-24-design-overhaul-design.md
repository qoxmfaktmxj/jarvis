# Design Overhaul — Notion-aligned Hybrid (2026-04-24)

| | |
|---|---|
| **Status** | Draft — awaiting user review |
| **Owner** | Minseok Kim |
| **Scope** | apps/web 전면 디자인 시스템 교체 |
| **Supersedes** | `docs/design-system.md` v2 (ISU Blue + Lime) |
| **References** | `DESIGN-notion.md` (Notion 참고 가이드) |
| **Brainstorm** | `.superpowers/brainstorm/1392-1777006506/content/*.html` |

## 1. Purpose

Jarvis 전반의 UI 언어를 **Notion 감성(warm neutrals + pure white + whisper borders + Notion Blue)**으로 교체하되, 엔터프라이즈 업무 툴의 정보 밀도는 유지한다. 결과적으로 Notion 도큐먼트 + Linear/Vercel 생산성 툴 중간 지점을 목표로 한다.

## 2. In-scope / Out-of-scope

**In-scope**
- `apps/web/app/globals.css` 토큰 전면 재작성 (ISU 260 hue → Notion warm neutral + Notion Blue)
- 라이트/다크 모드 토큰 세트 양쪽 다 교체
- `components/ui/*` shadcn primitives 토큰·스타일 리튠 (total **27 파일**):
  - **스타일 리튠(21)**: button, input, textarea, select, card, table, tabs, dialog, sheet, dropdown-menu, checkbox, radio-group, switch, tooltip, toast, toaster, badge, alert, accordion, avatar, popover
  - **토큰-only(6)**: calendar, form, label, scroll-area, separator, skeleton — 표면 색·border만 교체
- 패턴 헬퍼 4종 재작성: `Field`, `Select` (네이티브 밀도 버전), `StatusChip`, `PriorityChip`
- **9개 도메인 영역**(=라우트 단위) 리튠: Login · Dashboard · Ask AI · Search · Wiki · Knowledge · Systems · Attendance · Admin. 영역 하나에 여러 파일 포함 (예: Admin = UserTable + UserForm + AuditTable + CodeTable + MenuEditor + SettingsForm + OrgTree + SearchAnalyticsDashboard 등)
- `docs/design-system.md` v3 재작성 (Notion 통일판)
- 5개 프리뷰 HTML 목업 (`docs/superpowers/specs/previews/`)
- Lime 완전 제거 → graph-only 네임스페이스로 격리 (그래프는 Notion palette 순환)
- 새 `danger red #dc2626` 토큰 추가

**Out-of-scope (후속 과제로 분리)**
- 한국어 폰트 외 언어(영문 외) 추가 웹폰트 프로비저닝
- Notion의 데코레이션 일러스트(`The Great Wave`류) 도입 — 내부 툴에 과함
- 모바일 앱(React Native) 별도 가이드 — 없음
- 이모지·브랜드 일러스트 재제작
- Storybook 문서 자동화 (옵션, 필요 시 Phase 2 말미에 추가)

## 3. Locked decisions (Brainstorm Q1–Q6 결과)

| # | 결정 | 요약 |
|---|---|---|
| Q1 | **철학** | Hybrid: Notion chrome + 엔터프라이즈 밀도. 배경 **pure white 통일** (warm-white 교대 없음). **Pretendard Variable** 유지 (한글 안전 필수) |
| Q2 | **팔레트** | Full Notion (Notion Blue `#0075de` + warm neutrals + 6 semantic accents). **Lime 완전 제거** (UI 금지). **Danger red `#dc2626` 추가** |
| Q3 | **밀도 3-Tier** | T1 Spacious (읽기) / T2 Balanced (요약) / T3 Dense (테이블·폼). 화면별 매핑 §8 |
| Q4 | **롤아웃** | 2-phase: Phase 1 = tokens + primitives + 헬퍼 + docs (1 PR) · Phase 2 = 9개 화면 (T1→T2→T3 병렬 디스패치 가능) |
| Q5 | **리뷰** | Spec 단계: `/ui-ux-pro-max` + `/impeccable` · Phase 1 머지 후: `/design-review` · Phase 2 머지 후: `/design-review` 전 화면 sweep |
| Q6 | **프리뷰 목업 스코프** | 5개 full-screen HTML: Login / Dashboard / Wiki page / Ask AI / Task Table + Form |
| + | **다크 모드** | **스코프 포함**. 라이트/다크 토큰 페어를 이번 PR에서 같이 재작성 |

## 4. Design principles

1. **Pure white canvas** — 페이지 배경은 `#ffffff`. 섹션 교대 배경(`#f6f5f4` warm-white) **사용 안 함**. 시각 리듬은 보더·shadow·간격으로만 만든다.
2. **Whisper everything** — 보더는 `1px solid rgba(0,0,0,0.1)`가 기본. 이보다 진한 보더 금지 (T3 테이블 행 구분선 `rgba(0,0,0,0.06)` 예외).
3. **Warm under the hood** — neutral 스케일은 모두 yellow-brown undertone (Notion warm). cool gray(파랑 tint) 사용 금지.
4. **Blue stays singular** — Notion Blue `#0075de`가 UI 전체의 유일한 saturated accent. CTA·링크·focus·active 칩에만.
5. **Density is decided at tier level** — 새 화면을 만들 때 가장 먼저 "이 화면은 T1/T2/T3?"를 정한다. 폰트 크기·radius·패딩은 tier가 결정.
6. **Korean letter-spacing is neutral** — 음수 letter-spacing은 **Latin/숫자 전용**. 한글 블록엔 0.
7. **Motion 최소화** — `.shimmer` + `GlobeLoader`만. 호버 `scale(1.05)` 같은 Notion 웹사이트 장식은 내부 툴에 과함 → 도입 안 함.
8. **Accessibility 우선** — focus outline은 `2px solid #097fe8`, 제거 불가. 본문 텍스트는 WCAG AA 이상 유지.

## 5. Token definitions

### 5.1 Raw palette (light mode)

```css
/* Primary */
--color-notion-black:    rgba(0,0,0,0.95);  /* #000000f2 */
--color-white:           #ffffff;
--color-notion-blue:     #0075de;
--color-deep-navy:       #213183;
--color-active-blue:     #005bab;  /* button :active */
--color-focus-blue:      #097fe8;  /* focus ring */
--color-badge-blue-bg:   #f2f9ff;
--color-badge-blue-text: #097fe8;

/* Warm neutrals (yellow-brown undertone) */
--color-warm-50:  #faf9f8;  /* 서브 표면 — 테이블 헤더/폼 푸터 배경에만 사용 (페이지 bg 아님) */
--color-warm-100: #f6f5f4;  /* 섹션용 — 이번 개편에서는 사용 최소화 (pure white 우선) */
--color-warm-200: #e7e5e3;  /* 강조 보더 (드문 용도) */
--color-warm-300: #a39e98;  /* placeholder, muted, disabled */
--color-warm-500: #615d59;  /* secondary text, descriptions */
--color-warm-700: #47433f;  /* 강조 secondary (타이틀 옆 메타) */
--color-warm-900: #31302e;  /* dark surface (다크모드용) */

/* Semantic accents (Notion 6색) */
--color-teal:    #2a9d99;  /* success */
--color-green:   #1aae39;  /* confirmation, done */
--color-orange:  #dd5b00;  /* warning */
--color-pink:    #ff64c8;  /* decorative accent */
--color-purple:  #391c57;  /* premium, restricted */
--color-brown:   #523410;  /* earthy, archived */

/* Danger (신규 추가 — Notion 팔레트에 없음) */
--color-red-500: #dc2626;
--color-red-50:  #fef2f2;
--color-red-200: #fecaca;

/* Borders */
--color-whisper:      rgba(0,0,0,0.10);  /* 표준 카드·분할 */
--color-whisper-soft: rgba(0,0,0,0.06);  /* 테이블 행·카드 내부 */

/* Semantic surfaces (tinted backgrounds) */
--color-teal-50:   #e8f6f5;
--color-green-50:  #e7f7eb;
--color-orange-50: #fff4e6;
--color-pink-50:   #ffe6f5;
--color-purple-50: #efeaf5;
--color-brown-50:  #f4eee7;
```

### 5.2 Semantic tokens (role-based)

```css
:root {
  /* Page */
  --bg-page:            var(--color-white);        /* 모든 페이지 루트 */
  --bg-surface:         var(--color-warm-50);      /* 테이블 헤더·폼 푸터 */
  --fg-primary:         var(--color-notion-black);
  --fg-secondary:       var(--color-warm-500);
  --fg-muted:           var(--color-warm-300);

  /* Brand */
  --brand-primary:      var(--color-notion-blue);
  --brand-primary-hover:var(--color-active-blue);
  --brand-primary-bg:   var(--color-badge-blue-bg);
  --brand-primary-text: var(--color-badge-blue-text);

  /* Borders */
  --border-default:     var(--color-whisper);
  --border-soft:        var(--color-whisper-soft);
  --border-strong:      rgba(0,0,0,0.16);          /* 거의 사용 안 함 */
  --border-focus:       var(--color-focus-blue);

  /* Status (칩) */
  --status-done-bg:     var(--color-green-50);
  --status-done-fg:     var(--color-green);
  --status-success-bg:  var(--color-teal-50);
  --status-success-fg:  var(--color-teal);
  --status-active-bg:   var(--color-badge-blue-bg);
  --status-active-fg:   var(--color-badge-blue-text);
  --status-warn-bg:     var(--color-orange-50);
  --status-warn-fg:     var(--color-orange);
  --status-danger-bg:   var(--color-red-50);
  --status-danger-fg:   var(--color-red-500);
  --status-neutral-bg:  var(--color-warm-50);
  --status-neutral-fg:  var(--color-warm-700);
  --status-decorative-pink-bg:   var(--color-pink-50);
  --status-decorative-pink-fg:   var(--color-pink);
  --status-decorative-purple-bg: var(--color-purple-50);
  --status-decorative-purple-fg: var(--color-purple);
  --status-decorative-brown-bg:  var(--color-brown-50);
  --status-decorative-brown-fg:  var(--color-brown);

  /* Shadows */
  --shadow-soft:  rgba(0,0,0,0.04) 0 4px 18px,
                  rgba(0,0,0,0.027) 0 2.025px 7.84688px,
                  rgba(0,0,0,0.02) 0 0.8px 2.925px,
                  rgba(0,0,0,0.01) 0 0.175px 1.04062px;
  --shadow-deep:  rgba(0,0,0,0.01) 0 1px 3px,
                  rgba(0,0,0,0.02) 0 3px 7px,
                  rgba(0,0,0,0.02) 0 7px 15px,
                  rgba(0,0,0,0.04) 0 14px 28px,
                  rgba(0,0,0,0.05) 0 23px 52px;
  --shadow-flat:  0 1px 2px rgba(15,23,42,0.03);   /* T3 테이블/폼 */
}
```

### 5.3 Dark mode tokens

Notion의 warm-dark 사상을 따른다. 회색이 아닌 **매우 어두운 warm neutral**.

```css
:root[data-theme="dark"] {
  /* Page */
  --bg-page:            #191918;                    /* warm near-black */
  --bg-surface:         #242322;
  --fg-primary:         rgba(255,255,255,0.95);
  --fg-secondary:       #a8a4a0;
  --fg-muted:           #7c7874;

  /* Brand — 다크에서 Notion Blue는 살짝 밝게 */
  --brand-primary:      #529cca;
  --brand-primary-hover:#74b3d8;
  --brand-primary-bg:   rgba(82,156,202,0.12);
  --brand-primary-text: #74b3d8;

  /* Borders */
  --border-default:     rgba(255,255,255,0.094);
  --border-soft:        rgba(255,255,255,0.06);
  --border-focus:       #74b3d8;

  /* Status (다크용) — 배경은 accent color의 12% alpha, 텍스트는 밝은 variant */
  --status-done-bg:     rgba(26,174,57,0.15);
  --status-done-fg:     #4ccf64;
  --status-success-bg:  rgba(42,157,153,0.15);
  --status-success-fg:  #5cc5c1;
  --status-active-bg:   rgba(82,156,202,0.15);
  --status-active-fg:   #74b3d8;
  --status-warn-bg:     rgba(221,91,0,0.18);
  --status-warn-fg:     #ff8844;
  --status-danger-bg:   rgba(220,38,38,0.18);
  --status-danger-fg:   #ff6b6b;
  --status-neutral-bg:  rgba(255,255,255,0.06);
  --status-neutral-fg:  #a8a4a0;
  --status-decorative-pink-bg:   rgba(255,100,200,0.15);
  --status-decorative-pink-fg:   #ff85d3;
  --status-decorative-purple-bg: rgba(124,92,169,0.20);
  --status-decorative-purple-fg: #b598d5;
  --status-decorative-brown-bg:  rgba(176,128,84,0.18);
  --status-decorative-brown-fg:  #c9a583;

  /* Shadows — dark에선 약화 */
  --shadow-soft:  rgba(0,0,0,0.30) 0 4px 18px,
                  rgba(0,0,0,0.20) 0 1px 4px;
  --shadow-deep:  rgba(0,0,0,0.40) 0 14px 28px,
                  rgba(0,0,0,0.30) 0 4px 10px;
  --shadow-flat:  0 1px 2px rgba(0,0,0,0.4);
}
```

### 5.4 Graph visualization colors (isolated)

Lime은 UI에서 제거되지만 지식그래프(`/knowledge-graph`, wiki 그래프 뷰)에서는 카테고리 색이 필요. **`--graph-*` 네임스페이스로 격리** 하고 Tailwind preflight에서 `graph-*` 유틸만 허용:

```css
:root {
  --graph-node-1: var(--color-teal);    /* Domain: 기술 */
  --graph-node-2: var(--color-pink);    /* Domain: 고객/문의 */
  --graph-node-3: var(--color-purple);  /* Domain: 관리/어드민 */
  --graph-node-4: var(--color-brown);   /* Domain: Legacy/아카이브 */
  --graph-node-5: var(--color-orange);  /* Domain: 경보/위험 */
  --graph-node-6: var(--color-notion-blue); /* Domain: 연결/관계 */
}
```

**UI 컴포넌트(`components/ui/*`, `components/patterns/*`)에서 `--graph-*` 참조 금지.**

## 6. Typography system

### 6.1 Font stack

```css
--font-sans:    "Pretendard Variable", Pretendard, -apple-system, system-ui, "Segoe UI", sans-serif;
--font-display: "Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif;  /* 동일 */
--font-mono:    "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
```

**NotionInter 도입 안 함.** 한국어 렌더링 품질이 최우선. Pretendard가 Notion과 비슷한 display 압축 + 완성도 있는 한글 커버.

### 6.2 OpenType features

```css
body {
  font-family: var(--font-sans);
  font-feature-settings: "ss01", "tnum", "lnum";  /* stylistic, tabular, lining numerals */
  font-variant-numeric: tabular-nums;
}
```

숫자가 들어가는 셀(테이블 수치·ID·날짜)은 **항상** `tabular-nums` 적용.

### 6.3 Tier별 스케일

| Token | T1 Spacious | T2 Balanced | T3 Dense |
|---|---|---|---|
| **Body** | 16px / 400 / 1.7 | 13-14px / 400 / 1.5 | 13-13.5px / 400 / 1.5 |
| **H1 / Hero** | 48px / 700 / 1.04 / **-1.5px** | 30px / 700 / -0.625px | — |
| **H2 / Section** | 26px / 700 / 1.23 / **-0.625px** | 18px / 700 | 13px / 600 |
| **H3 / Card title** | 22px / 700 / -0.25px | 14px / 600 | 13px / 600 |
| **Lead** | 20px / 400 / 1.5 / -0.125px | — | — |
| **Label** | 14px / 500 | 11px / 600 uppercase tracking-[0.08em] | 10px / 600 uppercase tracking-[0.12em] |
| **Metric** | 40px / 700 / -0.5px | 30px / 700 / -0.625px | — |
| **Caption** | 14px / 400 | 12px / 500 | 11px / 500 |
| **Badge** | 12px / 600 tracking-[0.125px] | 11px / 600 | 10.5px / 600 |

### 6.4 Letter-spacing 규칙

**음수 letter-spacing은 Latin/숫자 블록에만 적용.** 한글이 섞인 타이틀에서는 0 또는 긍정 값 사용. 구현 방법:

```css
.hero-title { letter-spacing: -1.5px; }
.hero-title:lang(ko) { letter-spacing: 0; }  /* 또는 유틸 클래스 .han-title */
```

또는 Next.js `useLocale()`로 조건부 클래스 토글.

## 7. Tier × 컴포넌트 매트릭스

| | T1 Spacious | T2 Balanced | T3 Dense |
|---|---|---|---|
| **페이지 padding** | `py-20 px-12` | `py-8 px-8` | `py-6 px-6` |
| **Section gap** | 64-120px | 32-48px | 16-24px |
| **Card radius** | 12-16px | 10-12px | 8px |
| **Card padding** | 24-32px | 16-20px | 헤더 `px-5 py-3`, 바디 `p-4~5` |
| **Card shadow** | `--shadow-soft` | `--shadow-soft` | `--shadow-flat` |
| **Button radius** | 6px | 6px | 6px (동일) |
| **Button padding** | `px-4 py-2` (16px 16px) | `px-3 py-2` | `px-3 py-1.5` (sm) |
| **Button font** | 15px/600 | 13px/600 | 12px/600 |
| **Input radius** | 8px | 6px | 6px |
| **Input height** | 40px | 36px | 32px |
| **Input font** | 16px | 13-14px | 13px |

## 8. 3-Tier 화면 매핑 (전수)

### T1 — Spacious (Notion 정체성 100%)

| 화면 | 현재 파일(대표) |
|---|---|
| Login | `app/[locale]/(auth)/login/page.tsx` |
| 404 / 에러 페이지 | `app/[locale]/not-found.tsx`, `app/error.tsx` |
| Wiki 페이지 본문 | `components/WikiPageView/*`, `components/WikiEditor/*` |
| Knowledge 문서 뷰어 | `components/knowledge/PageViewer.tsx`, `PageEditor.tsx` |
| Ask AI 대화 본문 | `components/ai/AskConversation.tsx`, 메시지 버블 |
| Dashboard hero 헤더 | `app/[locale]/(app)/dashboard/page.tsx` 상단 영역 |
| Profile 편집 | `components/profile/*` |

### T2 — Balanced (요약 카드·그리드·리스트)

| 화면 | 현재 파일(대표) |
|---|---|
| Dashboard KPI 카드 그리드 | `components/patterns/KpiTile.tsx` + dashboard/page.tsx |
| Ask AI 사이드바(대화 리스트) | `components/ai/AskSidebar.tsx` |
| Search result card | `components/search/ResultCard.tsx` |
| Knowledge category 그리드 | `components/knowledge/CategoryGrid.tsx` |
| Notices 리스트 | `components/notices/*` |
| Systems 헬스 타일 | `components/system/SystemCard.tsx` |
| Attendance 캘린더 카드 | `components/attendance/AttendanceCalendar.tsx` |

### T3 — Dense (엔터프라이즈 테이블·폼)

| 화면 | 현재 파일(대표) |
|---|---|
| TaskTable | `components/project/TaskTable.tsx` |
| StaffTable | `components/project/StaffTable.tsx` |
| InquiryTable | `components/project/InquiryTable.tsx` |
| ProjectTable | `components/project/ProjectTable.tsx` |
| ProjectForm | `components/project/ProjectForm.tsx` |
| UserTable / UserForm | `components/admin/UserTable.tsx`, `UserForm.tsx` |
| AuditTable | `components/admin/AuditTable.tsx` |
| CodeTable | `components/admin/CodeTable.tsx` |
| MenuEditor | `components/admin/MenuEditor.tsx` |
| SettingsForm | `components/admin/SettingsForm.tsx` |
| OrgTree | `components/admin/OrgTree.tsx` |
| SearchAnalyticsDashboard | `components/admin/SearchAnalyticsDashboard.tsx` |
| AttendanceTable | `components/attendance/AttendanceTable.tsx` (캘린더 아래 표) |
| Access panels | `components/system/AccessPanel.tsx` |
| 각종 필터 툴바 | 공통 |

### 회색지대 (한 화면에 tier 혼재)

- **Ask AI:** 사이드바(T2) + 본문(T1) — 같은 라우트, 다른 tier
- **Wiki 페이지:** 본문(T1) + InfraRunbookHeader 메타 패널(T2) — 페이지 상단은 T2
- **Dashboard:** Hero(T1) + KPI 그리드(T2) — 상단과 하단이 다름
- **규칙:** 한 화면에 섞이는 건 OK. 단 **인접 블록 간 visual cohesion**이 유지되도록 카드 radius·shadow 패밀리는 맞춘다.

## 9. Component specifications

### 9.1 Button

| Variant | 사용처 | 스타일 |
|---|---|---|
| **Primary** (`default`) | Main CTA | `bg-[--brand-primary] text-white` hover `bg-[--brand-primary-hover]` focus `ring-2 ring-[--border-focus]` |
| **Secondary** (`secondary`) | 보조 액션 | `bg-[--color-warm-50] text-[--fg-primary] border border-[--border-default]` hover `bg-[--color-warm-100]` |
| **Ghost** (`ghost`) | 테이블 행 액션, 취소 | `bg-transparent text-[--fg-primary]` hover `bg-[--color-warm-50]` |
| **Outline** (`outline`) | T1 second-CTA | `bg-white border border-[--border-default] text-[--fg-primary]` |
| **Danger** (`danger`) | 삭제 | `bg-transparent text-[--color-red-500]` hover `bg-[--color-red-50]` |
| **Link** (`link`) | 인라인 | `text-[--brand-primary] underline-offset-2` hover `underline` |

**Sizes:** T1 기본 `default` (40px), T2/T3 기본 `sm` (32px). `accent` variant **삭제** (Lime 제거와 함께).

### 9.2 Input / Textarea / Select

- 기본 height: T1 40px / T2 36px / T3 32px (`h-8`)
- 기본 radius: T1 8px / T2 6px / T3 6px
- Border: `border-[--border-default]` → focus `border-[--brand-primary] ring-2 ring-[--brand-primary-bg]`
- Placeholder: `--fg-muted`
- T3에서는 기존 네이티브 `<Select>` 헬퍼 유지 (밀도 이점)

### 9.3 Card / Container

```tsx
// T1 Spacious card
<div className="rounded-2xl border border-[--border-default] bg-white shadow-[var(--shadow-soft)] p-8">

// T2 Balanced card
<div className="rounded-[10px] border border-[--border-default] bg-white shadow-[var(--shadow-soft)] p-5">

// T3 Dense card (폼/테이블 컨테이너)
<div className="rounded-lg border border-[--border-default] bg-white shadow-[var(--shadow-flat)] overflow-hidden">
```

**주의:** T3 `rounded-md` (6px) → `rounded-lg` (8px)로 소폭 상향. "내부 툴스러운 날카로움"은 유지하되 Notion whisper border와 어울리게.

### 9.4 Chip (updated status mapping)

```tsx
// 표준 StatusChip — Pattern helper
const STATUS_STYLES = {
  neutral:  "bg-[--status-neutral-bg] text-[--status-neutral-fg]",
  todo:     "bg-[--status-neutral-bg] text-[--status-neutral-fg]",
  active:   "bg-[--status-active-bg] text-[--status-active-fg]",
  progress: "bg-[--status-success-bg] text-[--status-success-fg]",  /* Teal = 진행 중 */
  review:   "bg-[--status-active-bg] text-[--status-active-fg]",
  done:     "bg-[--status-done-bg] text-[--status-done-fg]",
  success:  "bg-[--status-success-bg] text-[--status-success-fg]",
  warning:  "bg-[--status-warn-bg] text-[--status-warn-fg]",
  hold:     "bg-[--status-warn-bg] text-[--status-warn-fg]",
  danger:   "bg-[--status-danger-bg] text-[--status-danger-fg]",
  urgent:   "bg-[--status-danger-bg] text-[--status-danger-fg]",
  blocked:  "bg-[--status-danger-bg] text-[--status-danger-fg] border border-[--color-red-200]",
  // decorative (카테고리·도메인 구분용)
  pink:     "bg-[--status-decorative-pink-bg] text-[--status-decorative-pink-fg]",
  purple:   "bg-[--status-decorative-purple-bg] text-[--status-decorative-purple-fg]",
  brown:    "bg-[--status-decorative-brown-bg] text-[--status-decorative-brown-fg]",
};
```

**Chip 구조:**
- T1/T2: `text-[12px] font-semibold px-2.5 py-0.5 rounded-full tracking-[0.125px]`
- T3 (PriorityChip 포함): `text-[10.5px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide`
- **Dot 장식**(`<span class="h-1.5 w-1.5 rounded-full bg-[current]">`)은 T3 StatusChip에만 유지

### 9.5 Form Card (4-part pattern — 업데이트)

기존 v2 패턴을 거의 그대로 유지하되, 토큰만 교체:

```tsx
<form className="overflow-hidden rounded-lg border border-[--border-default] bg-white shadow-[var(--shadow-flat)]">
  {/* ① Header */}
  <div className="flex items-center gap-2 border-b border-[--border-default] bg-[--bg-surface] px-5 py-3">
    <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[--brand-primary-bg] text-[--brand-primary-text]">
      <Plus className="h-3.5 w-3.5" />
    </span>
    <div>
      <h2 className="text-[13px] font-semibold text-[--fg-primary]">새 태스크 추가</h2>
      <p className="text-[11px] text-[--fg-secondary]">이 프로젝트에 할 일을 기록합니다.</p>
    </div>
  </div>

  {/* ② Error strip */}
  {serverError && (
    <div className="flex items-start gap-2 border-b border-red-200 bg-[--color-red-50] px-5 py-3 text-[12.5px] text-[--color-red-500]">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{serverError}</span>
    </div>
  )}

  {/* ③ Body */}
  <div className="grid gap-4 p-5 md:grid-cols-2">
    <Field label="Title" span={2}><Input ... /></Field>
  </div>

  {/* ④ Footer */}
  <div className="flex items-center justify-between gap-3 border-t border-[--border-soft] bg-[--bg-surface]/60 px-5 py-3">
    <p className="text-[11px] text-[--fg-muted]">필수 항목: 제목</p>
    <Button type="submit" size="sm">
      <Plus className="h-3.5 w-3.5" /> 추가
    </Button>
  </div>
</form>
```

**기존 v2 패턴과의 차이:**
- `bg-surface-50/60` → `bg-[--bg-surface]` (warm-50, hue 0 → 40)
- `bg-isu-50` 아이콘 배지 → `bg-[--brand-primary-bg]` (Notion Blue tinted)
- `border-surface-*` → `border-[--border-*]`
- `rounded-md` (6px) → `rounded-lg` (8px)

### 9.6 Table Card

```tsx
<div className="overflow-hidden rounded-lg border border-[--border-default] bg-white shadow-[var(--shadow-flat)]">
  <Table>
    <TableHeader className="bg-[--bg-surface]">
      <TableRow className="border-[--border-default]">
        <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-[--fg-secondary]">
          Title
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow className="group border-[--border-soft] hover:bg-[--brand-primary-bg]">
        <TableCell className="py-3 text-[13.5px]">…</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

**변경:** `hover:bg-isu-50/40` → `hover:bg-[--brand-primary-bg]` (Notion Blue tinted).

### 9.7 Dialog / Sheet

- Modal-level에만 `rounded-xl` (12px) 허용 + `--shadow-deep`
- Header `px-6 py-4 border-b border-[--border-default]`
- Body `p-6`
- Footer `px-6 py-4 border-t border-[--border-soft] bg-[--bg-surface]/60`

### 9.8 Avatar

유지 (현재 패턴). 크기만 tier별:
- T1: `h-10 w-10` (text-[14px])
- T2: `h-8 w-8` (text-[12px])
- T3 inline: `h-5 w-5` (text-[10.5px])

### 9.9 Empty state

```tsx
<div className="flex flex-col items-center gap-2 py-14 text-center">
  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[--color-warm-50] text-[--fg-muted] ring-1 ring-[--border-default]">
    <ListChecks className="h-4 w-4" />
  </span>
  <p className="text-[13px] font-medium text-[--fg-primary]">아직 태스크가 없습니다.</p>
  <p className="text-[11px] text-[--fg-muted]">위 폼으로 첫 할 일을 기록해 보세요.</p>
</div>
```

## 10. Motion rules

**유지:**
- `.shimmer` 스켈레톤 로딩
- `GlobeLoader` 장시간 작업
- `transition-colors` 호버
- 아이콘 `animate-pulse` (Ask AI 로딩 중 `Sparkles`)

**도입 안 함:**
- Notion 공식 사이트의 `scale(0.9)` 버튼 press / `scale(1.05)` 호버 — 내부툴에 과함
- Decorative illustration 애니메이션
- Scroll-triggered reveal animation (페이지 로딩 체감만 악화)

**`prefers-reduced-motion: reduce`** 자동 비활성화 — 이미 `globals.css`에서 처리되어 있음. 유지.

## 11. Accessibility

- 본문 텍스트 대비: `--fg-primary` on `--bg-page` = ~18:1 (AAA)
- `--fg-secondary` on white = ~5.5:1 (AA)
- `--brand-primary` on white = ~4.6:1 (large text AA)
- **Focus outline**: 모든 인터랙티브 요소에 `outline: 2px solid var(--border-focus); outline-offset: 2px;`. 제거 금지.
- 터치 타겟: T1 44px+ / T2 40px+ / T3 32px+ (데스크톱 툴이므로 32px 허용)
- `prefers-color-scheme: dark` 자동 감지 + `data-theme` override 지원

## 12. Icons

- 라이브러리: **`lucide-react` 유지** (변경 없음)
- 크기 tier별:
  - T1: `h-5 w-5` (20px) — hero·feature
  - T2: `h-4 w-4` (16px) — 카드 헤더
  - T3: `h-3.5 w-3.5` (14px) — 버튼, 셀
  - T3 inline: `h-3 w-3` (12px)
- 색: `text-[--fg-secondary]` 기본, 상태 아이콘은 해당 status fg 토큰

## 13. i18n (next-intl)

- 한글 letter-spacing 0 규칙은 CSS `:lang(ko)` selector로 처리 (별도 prop 불필요)
- 모든 신규 UI 문자열은 `apps/web/messages/ko.json` + `en.json` 양쪽 추가
- 키 네임스페이스 컨벤션 유지: `<Domain>.<Component>.<key>`

## 14. Rollout plan

### Phase 1 — Foundation (1 PR)

**Scope:**
1. `apps/web/app/globals.css` 전면 재작성 (light + dark 토큰 페어)
2. Tailwind config v4 `@theme` 블록 업데이트 (만약 사용 중이면)
3. `components/ui/*` shadcn primitive 리튠 (27개 파일)
4. 패턴 헬퍼 4종 추출 → `components/patterns/{Field,Select,StatusChip,PriorityChip}.tsx`
5. `docs/design-system.md` v3 재작성
6. 5개 프리뷰 HTML을 `docs/superpowers/specs/previews/`에 커밋
7. **Lime 제거 정적 검증**: 빌드 시 `grep -r "lime-" apps/web/components apps/web/app` 결과 = 그래프 파일만(`components/knowledge-graph/*`, `wiki-graph` 등) 통과, 외는 fail
8. **Red 토큰 추가 검증**: `danger` 매핑 단위 테스트

**게이트:**
- `pnpm type-check && pnpm type-check` (TDD 연쇄)
- `pnpm test && pnpm test`
- `/ui-ux-pro-max` 리뷰 — 팔레트/타이포/컴포넌트 원칙 점검
- `/impeccable` 리뷰 — 프리뷰 HTML 품질 점검
- 수작업 스크린샷 비교 (기존 vs 신규) — 5개 프리뷰 모두

### Phase 2 — Screen Rollout (1 PR 또는 3 PR)

**병렬 디스패치 가능** — `superpowers:dispatching-parallel-agents` 또는 `subagent-driven-development` 활용.

**순서:**
1. T1 화면 (Login, Wiki Page 본문, Ask AI 대화, Dashboard Hero, Knowledge 뷰어)
2. T2 화면 (Dashboard KPI, Ask AI Sidebar, Search result, Knowledge 카테고리, Notices, Systems 헬스, Attendance 캘린더)
3. T3 화면 (TaskTable, StaffTable, InquiryTable, ProjectTable, ProjectForm, UserTable, UserForm, AuditTable, CodeTable, MenuEditor, SettingsForm, OrgTree, SearchAnalyticsDashboard, AccessPanel 등)

**게이트 (각 PR):**
- `pnpm type-check && pnpm type-check`
- `pnpm test && pnpm test`
- `pnpm e2e && pnpm e2e` (UI 스모크)
- `/design-review` 스킬로 실제 라우트 visual audit
- **Stale token check**: `grep -r "isu-\|surface-\|lime-" --include="*.tsx" --include="*.ts"` → 0 건 목표 (그래프 예외)

**PR 쪼개기 옵션:**
- **단일 PR (공격적):** Phase 2 하나로 — 장점: 이질감 없음 / 단점: diff 거대
- **3 PR (권장):** T1 → T2 → T3 — 장점: 리뷰 가능 / 단점: 중간 이질감 1-2일씩 존재

## 15. Review checkpoints

| 시점 | 스킬 | 목적 |
|---|---|---|
| Spec 작성 직후 | `/ui-ux-pro-max` | 팔레트·타이포·UX 원칙이 Notion/Linear 급 기준 충족하는지 |
| Spec 작성 직후 | `/impeccable` | 5개 프리뷰 HTML의 코드·aesthetic 품질, AI slop 여부 |
| Phase 1 머지 직후 | `/design-review` | 5개 프리뷰 HTML(`docs/superpowers/specs/previews/*.html`)을 로컬 정적 서버로 띄워 토큰·컴포넌트 원칙 준수 확인. 추가로 Storybook(있다면)에서 primitive들 확인. **아직 live 페이지는 구 스타일이므로 리뷰 대상 아님** |
| Phase 2 각 PR 머지 직후 | `/design-review` | 해당 tier 화면군 전수 visual sweep |
| 전 Phase 완료 후 | 수동 | 5 user 실사용 (대시보드 1h · Ask AI 대화 10회 · 위키 편집 3건 · 테이블 필터 다양화) → bug list |

## 16. Preview mockups

`docs/superpowers/specs/previews/` 아래 5개 full-screen HTML 생성. 각 파일은 self-contained (외부 CSS/JS 없음). 디자인 시스템 토큰을 하드코딩해 단독 실행 가능.

| 파일 | Tier | 대상 화면 |
|---|---|---|
| `login.html` | T1 | 로그인 (좌측 브랜드 패널 + 우측 폼) |
| `dashboard.html` | T1+T2 | Hero 헤더 + KPI 카드 3개 + 최근 활동 리스트 |
| `wiki-page.html` | T1 | 위키 페이지 본문 (breadcrumb · badges · hero title · lead · body · TOC 사이드) |
| `ask-ai.html` | T1+T2 | 대화 본문(T1) + 왼쪽 대화 히스토리 사이드바(T2) |
| `task-table.html` | T3 | 태스크 테이블 + 상단 폼 카드 (기존 TaskTable 패턴의 신 토큰 버전) |

다크 모드 대응은 각 프리뷰에 `?theme=dark` 쿼리로 토글 가능하게 만든다 (JS 3줄).

## 17. Success criteria

**Phase 1 완료 시점:**
- [ ] `components/ui/*` 27개 파일 모두 신 토큰 사용, `isu-*` / `surface-*` 참조 0건
- [ ] `apps/web/app/globals.css`의 `--color-isu-*`, `--color-surface-*`, `--color-lime-*` 토큰 제거 또는 alias-만-남김 (Phase 2 소비를 위한 bridge)
- [ ] 4개 패턴 헬퍼(`Field`, `Select`, `StatusChip`, `PriorityChip`) `components/patterns/` 추출 완료
- [ ] 5개 프리뷰 HTML이 리포에 커밋되어 있고, 정적 서버에서 실행 시 light/dark 양쪽 모두 정상 렌더
- [ ] `docs/design-system.md` v3 재작성 커밋 (old content deprecated 섹션으로 보존)

**Phase 2 완료 시점 (최종):**
- [ ] `apps/web/` 내 `lime-*` 클래스 0건 (graph 격리 파일 제외)
- [ ] `apps/web/` 내 `isu-*` 클래스 0건 (기존 브랜드 잔존 제거)
- [ ] `apps/web/` 내 `surface-*` 클래스 0건 (신 토큰 사용)
- [ ] `apps/web/` 내 `text-rose-*` 클래스 0건 (red로 통일)
- [ ] `globals.css`의 alias bridge 토큰 제거됨
- [ ] 인라인 hex/rgb 컬러 0건 (`#[0-9a-f]` grep 검사, 브랜드 로고 SVG 제외)
- [ ] 모든 페이지 루트가 `--bg-page` (즉 pure white) 사용
- [ ] 모든 인터랙티브 요소에 focus outline 시각적으로 확인 가능
- [ ] 다크 모드 토글 시 모든 페이지에서 대비 규칙 깨지지 않음
- [ ] WCAG AA 이상 대비 (자동 도구: `@axe-core/react` 또는 Lighthouse a11y 95+ 통과)
- [ ] 프리뷰 5개 HTML과 실제 구현 페이지 간 시각 편차 < 5% (스크린샷 수동 비교)

## 18. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 머지 후 화면이 옛 토큰 참조하며 시각 붕괴 | Phase 1에서 기존 `isu-*`, `surface-*` 클래스를 **alias**로 임시 매핑 (새 토큰으로 resolve). Phase 2 최종 PR에서 alias 제거 |
| 다크 모드 status 칩 대비 부족 | Phase 1 머지 후 `/design-review` 다크 모드로 실행 필수 |
| 한글 letter-spacing 규칙 누락 → 헤드라인 깨짐 | `.hero-title:lang(ko)` selector 패턴을 Storybook에 고정 예제로 추가 (Phase 1) |
| Lime 잔존 → 그래프 이외 곳에서 그린 색 튀어나옴 | Phase 1 게이트에 `grep` 검증. CI 블로킹 |
| Pretendard CDN 지연 → FOIT | `next/font/local` 번들 (이미 적용 중이면 유지) |
| 테이블 밀도 T3 유지했는데 외부 사용자 "너무 빽빽"이라 피드백 | Phase 2 중 T3 → T2 전환 옵션 설정 (`data-density="relaxed"` global attr), 별도 설정 화면 (옵션, 이번 PR엔 미포함) |

## 19. Open questions (after brainstorm)

없음. 모든 결정 Q1–Q6 + 다크 모드 추가로 완결.

## 20. Next step

사용자가 이 spec 리뷰하고 OK하면 → `superpowers:writing-plans` 스킬 invoke → Phase 1 implementation plan 문서 생성.
