# Design System Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis 디자인 시스템 도입 — `--bg-page`/`--bg-surface` swap(페이지 warm-50 + 카드/chrome 순백) + `--brand-primary` 파생 토큰을 `color-mix()` 기반으로 전환 + 5테마(Notion Blue · Indigo · Teal · Forest · Graphite) `data-theme-color` picker 도입 + 사이드바 active 항목 brand-primary 틴트 + 3px 좌측 indicator. 다크 테마도 동일 5테마 지원.

**Architecture:**
- globals.css 토큰 layer 재구성. `--brand-primary`를 single source로 잡고 hover/bg/text를 `color-mix(in oklab, ...)`로 자동 파생. `data-theme-color="..."` 5블록은 `--brand-primary` 하나만 override.
- 페이지/카드 색 swap: `--bg-page = #faf9f8` (warm-50) + `--bg-surface = #ffffff` (순백). chrome(Sidebar/Topbar)은 기존 `var(--panel)` 사용 — `--panel`도 `var(--bg-surface)` alias로 변경되어 자동 #fff. 카드 elevation은 기존 `--shadow-soft` + `--border-default` (0.10) 유지.
- 사이드바 expanded active: `var(--line2)` warm pill → `var(--brand-primary-bg)` 브랜드 틴트 pill + `var(--brand-primary-text)` 글자색 + 좌측 3px indicator. rail active는 이미 brand-primary 사용 — 검증만.
- ThemeColorPicker는 신규 컴포넌트, UserMenu dropdown의 "테마 설정 [준비 중]" 버튼을 활성 submenu 트리거로 교체. 5 swatch radio. 선택은 `document.documentElement.dataset.themeColor` 세팅 + `localStorage.jv.themeColor` 영속. SSR-safe bootstrap script 추가.
- 다크 테마는 light hex을 그대로 사용 — `color-mix(in oklab, var(--brand-primary) 24%, transparent)`로 bg/text 파생하면 다크 배경에서 자연스럽게 dim. brand-primary-hover만 색별 +15% lightness 보정.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 + CSS vars, next-intl 단일 로케일(ko, en은 mirror), localStorage `jv.themeColor`, Playwright e2e.

---

## Decision Snapshot (이 plan 작성 전 사용자 확정 11건)

| # | 항목 | 값 |
|---|---|---|
| 1 | Q5 swap | **B안** — page warm-50 / chrome #fff / card #fff |
| 2 | 테마 5종 | Notion Blue `#0075de` / Indigo `#5e6ad2` / Teal `#2a9d99` / Forest `#0f6e3a` / Graphite `#171717` |
| 3 | Sunset 제외 | 확정 (CTA = Warn 완전 동일 hex) |
| 4 | Status chip 형태 | dot + 틴트 pill (현재 정책 유지) |
| 5 | Shadow | `--shadow-soft` 유지 (강화 X) |
| 6 | Border | `rgba(0,0,0,0.10)` 유지 |
| 7 | brand-primary 파생 | `color-mix(in oklab, ...)` |
| 8 | 사이드바 active | `--brand-primary-bg` + `--brand-primary-text` + 3px 좌측 indicator |
| 9 | 다크테마 | 5테마 동일 적용 (light hex 그대로 + color-mix 자동 파생) |
| 10 | ThemeSwitcher 위치 | UserMenu "테마 설정" → submenu (Q4=B) |
| 11 | i18n | 테마 이름 5개 ko + en 키 추가 |

Mockup 시각 검증 2회 완료 (`.local/design-preview/theme-collision-mockup.html`).

---

## 영향도 매트릭스 (jarvis-architecture 17계층)

| 계층 | 변경 여부 | 비고 |
|------|---------|------|
| DB 스키마 | 없음 | 테마 설정 server-side persistence 없음 (localStorage only) |
| Validation | 없음 | |
| 권한 (47 상수) | 없음 | UI preference에 권한 가드 없음 |
| 세션 vs 권한 모델 | 없음 | |
| workspaceId 격리 | 없음 | |
| Ask AI / tool-use agent | 없음 | |
| Wiki-fs (Karpathy) | 없음 | |
| 검색 | 없음 | |
| 서버 액션/API | 없음 | |
| 서버 로직 (lib) | 없음 | |
| UI 라우트 | 없음 | 신규 라우트 추가 없음 |
| **UI 컴포넌트** | **★ 변경** | Sidebar.tsx active state · UserMenu.tsx submenu · ThemeColorPicker.tsx 신설 · uiPrefs.ts hook 확장 |
| **i18n 키** | **★ 변경** | ko.json + en.json에 `Theme.colors.*` (5키) + `Theme.picker.*` (2키) |
| **테스트** | **★ 변경** | uiPrefs unit test · ThemeColorPicker unit test · 신규 e2e `theme-picker.spec.ts` · 기존 `sidebar-rbac.spec.ts` snapshot 영향 |
| 워커 잡 | 없음 | |
| LLM 호출 | 없음 | |
| Audit | 없음 | UI preference에 audit_log 불필요 |
| **CSS 토큰 (globals.css)** | **★ 변경** | swap + color-mix 파생 + data-theme-color 5블록 (light + dark) |

---

## File Structure

신규/수정 파일 책임:

| 파일 | 책임 | 변경 종류 |
|------|------|---------|
| `apps/web/app/globals.css` | CSS 토큰 SoT. swap + color-mix 파생 + 5테마 블록 | 수정 |
| `apps/web/components/layout/Sidebar.tsx` | expanded active state 시각 변경 (brand-primary 틴트 + 3px indicator) | 수정 |
| `apps/web/components/layout/uiPrefs.ts` | `useThemeColor` / `setThemeColor` 추가, bootstrap script 확장 | 수정 |
| `apps/web/components/layout/uiPrefs.test.ts` | useThemeColor unit test | 신설 |
| `apps/web/components/layout/ThemeColorPicker.tsx` | 5 swatch radio group + aria 동작 | **신설** |
| `apps/web/components/layout/ThemeColorPicker.test.tsx` | 컴포넌트 렌더/클릭/aria unit test | **신설** |
| `apps/web/components/layout/UserMenu.tsx` | "테마 설정 [준비 중]" 버튼 → 활성 submenu 트리거 + ThemeColorPicker 통합 | 수정 |
| `apps/web/messages/ko.json` | `Theme.colors.*` 5키 + `Theme.picker.*` 2키 추가 | 수정 |
| `apps/web/messages/en.json` | 동일 키 mirror (영문) | 수정 |
| `apps/web/e2e/theme-picker.spec.ts` | 5 swatch 클릭 + localStorage 영속 + reload 유지 + aria 검증 | **신설** |
| `apps/web/e2e/sidebar-rbac.spec.ts` | active state DOM/스타일 변경 영향 검증 (필요시 셀렉터 조정) | 수정 |
| `CLAUDE.md` | 변경 이력 1줄 추가 | 수정 |

**파일 변경 순서** (jarvis-architecture 20단계 중 해당만):
- 15(UI 컴포넌트) → 16(i18n 마지막 배치) → 19(테스트)
- globals.css는 15의 sub-step 0으로 가장 먼저 (토큰이 모든 컴포넌트의 기반)

---

## Task 1: CSS 토큰 재구성 (globals.css)

**Files:**
- Modify: `apps/web/app/globals.css` (라이트 블록 lines 138-152, 다크 블록 lines 337-348, prototype alias lines 242-250 + 392-405)

### Step 1.1: 라이트 테마 토큰 swap + color-mix 파생

- [ ] **현재 라이트 블록 swap 적용**

`apps/web/app/globals.css` lines 138-152를 다음과 같이 수정:

```css
  /* Role aliases (primitive에서 직접 참조) */
  /* 2026-05-16: Q5=B 적용 — 페이지 warm-50, 카드/chrome 순백 swap.
   * sensitivity 차원이 아니라 elevation 차원: warm은 "캔버스",
   * 순백은 "올라온 것". */
  --bg-page:                    var(--color-warm-50);  /* #faf9f8 */
  --bg-surface:                 #ffffff;
  --fg-primary:                 var(--color-notion-black);
  --fg-secondary:               var(--color-warm-500);
  --fg-muted:                   var(--color-warm-300);

  /* brand-primary 단일 SoT. hover/bg/text는 color-mix로 자동 파생.
   * data-theme-color="..." 5블록은 --brand-primary 한 줄만 override한다. */
  --brand-primary:              var(--color-notion-blue);
  --brand-primary-hover:        color-mix(in oklab, var(--brand-primary) 80%, black 20%);
  --brand-primary-bg:           color-mix(in oklab, var(--brand-primary)  8%, white 92%);
  --brand-primary-text:         var(--brand-primary);

  --border-default:             var(--color-whisper);
  --border-soft:                var(--color-whisper-soft);
  --border-focus:               var(--brand-primary);
```

**검증 포인트:** `--border-focus`도 이전 `--color-notion-blue-text` 하드코딩에서 `var(--brand-primary)` 참조로 바뀜 → 테마 변경 시 focus ring도 자동 따라감.

### Step 1.2: prototype alias (panel/bg/ink) swap 일관성

- [ ] **lines 242-250 prototype 블록 수정**

```css
    /* ── Prototype token aliases — Q5=B swap 반영 ───────────── */
    --bg:          var(--bg-page);     /* warm-50 캔버스 */
    --panel:       var(--bg-surface);  /* #fff elevated (카드 + chrome) */
    --line:        var(--border-default);
    --line2:       var(--border-soft);
    --ink:         var(--fg-primary);
    --ink2:        var(--color-warm-700);
    --muted:       var(--color-warm-500);
    --faint:       var(--color-warm-300);
```

**효과:** Sidebar.tsx / Topbar.tsx의 `background: var(--panel)`이 자동 #fff. 코드 변경 없이 chrome 화이트화 달성.

### Step 1.3: 5테마 `data-theme-color` 블록 (라이트)

- [ ] **lines 152(`--border-focus` 뒤) 다음에 5 블록 추가**

```css
}
/* ── Theme palette · light ─────────────────────────────────────
 * --brand-primary 하나만 override. hover/bg/text는 위 color-mix가
 * 자동으로 따라간다. data-theme-color="blue"는 기본값이므로
 * override가 필요 없지만, 명시적으로 둬서 picker 활성 상태 표시 가능. */
:root[data-theme-color="blue"]     { --brand-primary: #0075de; }
:root[data-theme-color="indigo"]   { --brand-primary: #5e6ad2; }
:root[data-theme-color="teal"]     { --brand-primary: #2a9d99; }
:root[data-theme-color="forest"]   { --brand-primary: #0f6e3a; }
:root[data-theme-color="graphite"] { --brand-primary: #171717; }

:root {
```

**중요:** 이전 `:root {` 블록을 닫고 5블록 후에 새 `:root {` 블록을 다시 열어 status 토큰 정의가 이어지도록 한다. 또는 5 블록을 status 토큰 정의 뒤로 옮겨도 무방.

### Step 1.4: 다크 테마 적용 (color-mix 파생 통일 + 5테마 블록)

- [ ] **lines 337-348 다크 블록 수정**

```css
  --bg-page:                    #191918;
  --bg-surface:                 #242322;
  --fg-primary:                 rgba(255,255,255,0.95);
  --fg-secondary:               #a8a4a0;
  --fg-muted:                   #7c7874;

  /* 다크 — brand-primary는 light와 동일 hex 사용. bg/text는 color-mix로
   * 어두운 배경에 자연스럽게 dim. hover는 lightness +15% 보정. */
  --brand-primary:              var(--color-notion-blue);
  --brand-primary-hover:        color-mix(in oklab, var(--brand-primary) 70%, white 30%);
  --brand-primary-bg:           color-mix(in oklab, var(--brand-primary) 18%, transparent);
  --brand-primary-text:         color-mix(in oklab, var(--brand-primary) 70%, white 30%);
  --border-default:             rgba(255,255,255,0.094);
  --border-soft:                rgba(255,255,255,0.06);
  --border-focus:               var(--brand-primary);
```

- [ ] **다크 블록 끝에 5테마 블록 추가**

`}` (다크 블록 닫음) 직전에:

```css
}
/* 다크 5테마 — light hex 그대로 + color-mix 파생이 다크 처리를 담당 */
:root[data-theme="dark"][data-theme-color="blue"]     { --brand-primary: #0075de; }
:root[data-theme="dark"][data-theme-color="indigo"]   { --brand-primary: #5e6ad2; }
:root[data-theme="dark"][data-theme-color="teal"]     { --brand-primary: #2a9d99; }
:root[data-theme="dark"][data-theme-color="forest"]   { --brand-primary: #0f6e3a; }
:root[data-theme="dark"][data-theme-color="graphite"] { --brand-primary: #f5f5f5; }
```

**Graphite 다크 특별 처리:** `#171717`은 다크 배경(`#191918`)과 거의 동일 → 보이지 않음. 다크에서는 반전 `#f5f5f5` (white) 사용해 monochrome 결을 유지.

### Step 1.5: 다크 prototype alias 일관성

- [ ] **lines 392-405 prototype 다크 블록 수정**

```css
  /* Prototype tokens — warm-dark 팔레트 */
  --bg:           var(--bg-page);
  --panel:        var(--bg-surface);
  --line:         var(--border-default);
  --line2:        var(--border-soft);
  --ink:          var(--fg-primary);
  --ink2:         #c9c5c0;
  --muted:        #a8a4a0;
  --faint:        #7c7874;
  --accent:       var(--brand-primary);
  --accent-ink:   var(--brand-primary-text);
  --accent-tint:  var(--brand-primary-bg);
  --shadow-md:    0 2px 6px rgba(0,0,0,0.40), 0 6px 20px rgba(0,0,0,0.30);
  --shadow-lg:    0 10px 30px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.35);
```

### Step 1.6: type-check + dev server smoke test

- [ ] **type-check 실행**

```bash
pnpm --filter @jarvis/web type-check
```

Expected: PASS (CSS 변경만이라 영향 없음, 보장차원).

- [ ] **dev 서버 띄우고 시각 확인**

```bash
pnpm --filter @jarvis/web dev
```

브라우저로 `http://localhost:3010/dashboard` 접속.
**확인:**
- 페이지 배경 warm-50 (살짝 따뜻한 회색)
- KPI 카드들 순백 + whisper border + soft shadow로 떠보임
- 사이드바 + 탑바 순백 (회색 띠 사라짐 — 사용자 사진 1·2의 회색 일소)

`/holidays`도 확인:
- 그리드 헤더 순백 (이전 warm-50 회색에서 변경)
- 검색 패널 순백

- [ ] **Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(design): swap bg-page/bg-surface, derive brand-primary via color-mix, add 5-theme data-theme-color blocks

- Q5=B: page warm-50, card/chrome white (회색 띠 일소)
- brand-primary hover/bg/text를 color-mix(in oklab)로 자동 파생
- data-theme-color={blue,indigo,teal,forest,graphite} 5블록 (light + dark)
- 다크 graphite는 #f5f5f5로 반전 (다크 bg와 충돌 방지)
- prototype alias(--panel, --bg 등)도 새 SoT 참조로 통일

mockup 검증: .local/design-preview/theme-collision-mockup.html
plan: docs/superpowers/plans/2026-05-16-design-system-adoption.md"
```

---

## Task 2: 사이드바 active 시각 (Sidebar.tsx)

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx` lines 122-176 (NavButton expanded active state)

### Step 2.1: NavButton expanded active state 변경

- [ ] **현재 코드 (lines 124-176) 수정**

`background: active && expanded ? "var(--line2)" : "transparent"` 부분을 `--brand-primary-bg` 틴트로, color는 `--brand-primary-text`로. 3px 좌측 indicator는 active && expanded일 때만 추가 (rail은 기존 indicator 유지).

NavButton 함수 내부 `<Link>` 컴포넌트 부분을 교체:

```tsx
  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-current={active ? "page" : undefined}
      title={!expanded ? label : undefined}
      className="group relative flex items-center rounded-lg transition-colors"
      style={{
        gap: 10,
        padding: expanded ? "7px 10px" : "9px 0",
        justifyContent: expanded ? "flex-start" : "center",
        color: active
          ? "var(--brand-primary-text)"
          : "var(--muted)",
        background: active && expanded ? "var(--brand-primary-bg)" : "transparent",
        fontWeight: active ? 500 : 400,
        fontSize: 13.5,
      }}
    >
      {/* Active indicator: 3px 좌측 막대.
       * rail 모드: 기존 indicator(중앙 정렬, h-14) 유지.
       * expanded 모드: 상하 6px 마진, brand-primary 색. */}
      {active && !expanded ? (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: 6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 14,
            background: "var(--brand-primary)",
            borderRadius: 2,
          }}
        />
      ) : null}
      {active && expanded ? (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: -2,
            top: 6,
            bottom: 6,
            width: 3,
            background: "var(--brand-primary)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      ) : null}
      <span className="inline-flex shrink-0">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {expanded ? <span className="truncate">{label}</span> : null}
      {/* Badge — expanded 모드에서만 (rail에서는 라벨이 숨겨지므로 배지도
          생략). menu_item.badge 가 비어 있지 않은 행에만 렌더된다. */}
      {expanded && badge ? (
        <span
          aria-label={`${label} ${badge}`}
          className="ml-auto inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: "color-mix(in oklab, var(--brand-primary) 14%, transparent)",
            color: "var(--brand-primary)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
```

**중요 변경점:**
1. `active` 글자색이 `--ink` → `--brand-primary-text` (블루)
2. `active && expanded` 배경이 `--line2` (warm) → `--brand-primary-bg` (브랜드 8% 틴트)
3. expanded active일 때 좌측 3px indicator 추가 (이전엔 expanded 모드에 없었음)
4. rail active indicator는 기존 그대로
5. Badge는 그대로 (이미 brand-primary 사용 중)

### Step 2.2: 시각 smoke test

- [ ] **dev 서버에서 사이드바 active 확인**

```bash
pnpm --filter @jarvis/web dev
```

- expanded 모드: 활성 메뉴 항목 = 브랜드 블루 8% 틴트 + 블루 글자 + 좌측 3px 블루 막대 (사용자 사진4 위치)
- rail 모드 (사이드바 접기): 활성 = 블루 아이콘 + 중앙 좌측 indicator (기존 유지)
- 다른 메뉴 hover: 회색 hover 유지 (active 아닐 때 영향 없음)

### Step 2.3: type-check + lint

- [ ] **검증 실행**

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web lint
```

Expected: 둘 다 PASS.

### Step 2.4: Commit

- [ ] **커밋**

```bash
git add apps/web/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): brand-primary 틴트 active + 3px 좌측 indicator (expanded)

- expanded active: var(--line2) warm pill → var(--brand-primary-bg) 브랜드 틴트
- 글자색: var(--ink) → var(--brand-primary-text)
- 좌측 3px brand-primary 막대 indicator 추가 (위치 명확화)
- rail active 시각은 기존 유지 (이미 brand-primary 패턴)

테마 변경 시 active 색도 자동 따라감 (Q1 color-mix 파생)."
```

---

## Task 3: useThemeColor hook + localStorage 영속 (uiPrefs.ts)

**Files:**
- Modify: `apps/web/components/layout/uiPrefs.ts`
- Create: `apps/web/components/layout/uiPrefs.test.ts`

### Step 3.1: 실패하는 unit test 먼저 작성

- [ ] **`apps/web/components/layout/uiPrefs.test.ts` 신설**

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  setThemeColor,
  useThemeColor,
  DEFAULT_THEME_COLOR,
  THEME_COLOR_IDS,
  type ThemeColorId,
} from "./uiPrefs";

describe("uiPrefs.themeColor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-color");
  });

  it("DEFAULT_THEME_COLOR가 'blue'", () => {
    expect(DEFAULT_THEME_COLOR).toBe("blue");
  });

  it("THEME_COLOR_IDS가 5종", () => {
    expect(THEME_COLOR_IDS).toEqual(["blue", "indigo", "teal", "forest", "graphite"]);
  });

  it("setThemeColor가 localStorage + data-theme-color attribute + event 발행", () => {
    const listener = vi.fn();
    window.addEventListener("jv:theme-color-change", listener);

    setThemeColor("indigo");

    expect(window.localStorage.getItem("jv.themeColor")).toBe("indigo");
    expect(document.documentElement.getAttribute("data-theme-color")).toBe("indigo");
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent<ThemeColorId>).detail;
    expect(detail).toBe("indigo");

    window.removeEventListener("jv:theme-color-change", listener);
  });

  it("useThemeColor가 localStorage에서 초기값 읽음", () => {
    window.localStorage.setItem("jv.themeColor", "forest");
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe("forest");
  });

  it("useThemeColor가 invalid 값을 'blue'로 fallback", () => {
    window.localStorage.setItem("jv.themeColor", "invalid-color");
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe("blue");
  });

  it("useThemeColor가 setThemeColor 호출에 반응", () => {
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe("blue");
    act(() => setThemeColor("teal"));
    expect(result.current).toBe("teal");
  });
});
```

- [ ] **테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/web exec vitest run apps/web/components/layout/uiPrefs.test.ts
```

Expected: FAIL — `setThemeColor`, `useThemeColor`, `DEFAULT_THEME_COLOR`, `THEME_COLOR_IDS`, `ThemeColorId` not exported from uiPrefs.

### Step 3.2: uiPrefs.ts 확장 — themeColor 패턴 추가

- [ ] **`apps/web/components/layout/uiPrefs.ts` 수정**

기존 파일에 다음 추가 (sidebar/theme 패턴 미러):

기존 상수 블록 (lines 19-25) 다음에:

```ts
const THEME_COLOR_KEY = "jv.themeColor";
const THEME_COLOR_EVENT = "jv:theme-color-change";

export const THEME_COLOR_IDS = ["blue", "indigo", "teal", "forest", "graphite"] as const;
export type ThemeColorId = (typeof THEME_COLOR_IDS)[number];
export const DEFAULT_THEME_COLOR: ThemeColorId = "blue";

function isThemeColorId(v: string | null): v is ThemeColorId {
  return v !== null && (THEME_COLOR_IDS as readonly string[]).includes(v);
}

function readThemeColor(): ThemeColorId {
  if (typeof window === "undefined") return DEFAULT_THEME_COLOR;
  const v = window.localStorage.getItem(THEME_COLOR_KEY);
  return isThemeColorId(v) ? v : DEFAULT_THEME_COLOR;
}
```

기존 `setTheme` 함수 (line 46-51) 다음에:

```ts
export function setThemeColor(color: ThemeColorId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_COLOR_KEY, color);
  document.documentElement.setAttribute("data-theme-color", color);
  window.dispatchEvent(new CustomEvent<ThemeColorId>(THEME_COLOR_EVENT, { detail: color }));
}
```

기존 `useTheme` 함수 (lines 76-88) 다음에:

```ts
export function useThemeColor(): ThemeColorId {
  const [color, setColorState] = useState<ThemeColorId>(DEFAULT_THEME_COLOR);
  useEffect(() => {
    const initial = readThemeColor();
    setColorState(initial);
    document.documentElement.setAttribute("data-theme-color", initial);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ThemeColorId>).detail;
      if (isThemeColorId(detail)) setColorState(detail);
    };
    window.addEventListener(THEME_COLOR_EVENT, handler);
    return () => window.removeEventListener(THEME_COLOR_EVENT, handler);
  }, []);
  return color;
}
```

기존 `UI_PREFS_BOOTSTRAP` 상수 (lines 94-102)를 다음과 같이 확장 (FOUC 방지):

```ts
export const UI_PREFS_BOOTSTRAP = `
(function(){try{
  var s=localStorage.getItem('${SIDEBAR_KEY}');
  var t=localStorage.getItem('${THEME_KEY}');
  var c=localStorage.getItem('${THEME_COLOR_KEY}');
  var validColors=${JSON.stringify(THEME_COLOR_IDS)};
  var root=document.documentElement;
  root.setAttribute('data-sidebar', s==='rail'?'rail':'expanded');
  root.setAttribute('data-theme', t==='dark'?'dark':'light');
  root.setAttribute('data-theme-color', validColors.indexOf(c)>=0?c:'${DEFAULT_THEME_COLOR}');
}catch(e){}})();
`.trim();
```

### Step 3.3: 테스트 재실행 (PASS 확인)

- [ ] **테스트 PASS**

```bash
pnpm --filter @jarvis/web exec vitest run apps/web/components/layout/uiPrefs.test.ts
```

Expected: 6 tests PASS.

### Step 3.4: Commit

- [ ] **커밋**

```bash
git add apps/web/components/layout/uiPrefs.ts apps/web/components/layout/uiPrefs.test.ts
git commit -m "feat(uiPrefs): add useThemeColor / setThemeColor + 5-color whitelist

- localStorage key 'jv.themeColor' (sidebar/theme 패턴 미러)
- document.documentElement.dataset.themeColor 동기화
- THEME_COLOR_IDS as const (typed whitelist, 5 colors)
- UI_PREFS_BOOTSTRAP inline script 확장 (FOUC 방지)
- invalid 값은 DEFAULT_THEME_COLOR 'blue'로 fallback
- 6 vitest unit test (TDD)"
```

---

## Task 4: ThemeColorPicker 컴포넌트 (신설)

**Files:**
- Create: `apps/web/components/layout/ThemeColorPicker.tsx`
- Create: `apps/web/components/layout/ThemeColorPicker.test.tsx`

### Step 4.1: 실패하는 unit test 먼저

- [ ] **`apps/web/components/layout/ThemeColorPicker.test.tsx` 신설**

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeColorPicker } from "./ThemeColorPicker";

const messages = {
  Theme: {
    picker: {
      title: "테마 색상",
      aria: "테마 색상 선택",
    },
    colors: {
      blue: "Notion Blue",
      indigo: "Indigo",
      teal: "Teal",
      forest: "Forest",
      graphite: "Graphite",
    },
  },
};

function renderPicker() {
  return render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <ThemeColorPicker />
    </NextIntlClientProvider>
  );
}

describe("ThemeColorPicker", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-color");
  });

  it("5개 swatch radio 렌더", () => {
    renderPicker();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
  });

  it("각 swatch가 aria-label로 색상 이름 노출", () => {
    renderPicker();
    expect(screen.getByRole("radio", { name: "Notion Blue" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Indigo" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Teal" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Forest" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Graphite" })).toBeTruthy();
  });

  it("초기 active = 'blue' (DEFAULT_THEME_COLOR)", () => {
    renderPicker();
    expect(screen.getByRole("radio", { name: "Notion Blue" }).getAttribute("aria-checked")).toBe(
      "true"
    );
  });

  it("swatch 클릭 시 localStorage + data-theme-color 업데이트", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "Forest" }));
    expect(window.localStorage.getItem("jv.themeColor")).toBe("forest");
    expect(document.documentElement.getAttribute("data-theme-color")).toBe("forest");
    expect(screen.getByRole("radio", { name: "Forest" }).getAttribute("aria-checked")).toBe(
      "true"
    );
  });

  it("radiogroup이 aria-label 가짐", () => {
    renderPicker();
    expect(screen.getByRole("radiogroup", { name: "테마 색상 선택" })).toBeTruthy();
  });
});
```

- [ ] **테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/web exec vitest run apps/web/components/layout/ThemeColorPicker.test.tsx
```

Expected: FAIL — `ThemeColorPicker` not exported.

### Step 4.2: 컴포넌트 구현

- [ ] **`apps/web/components/layout/ThemeColorPicker.tsx` 신설**

```tsx
"use client";

/**
 * ThemeColorPicker — 5 swatch radio group.
 * UserMenu submenu에서 사용. 클릭 시 document.documentElement.dataset.themeColor
 * 세팅 + localStorage 영속 (uiPrefs.setThemeColor 경유).
 *
 * 5테마는 colors_and_type.css 디자인 킷에서 검증된 라인업:
 *   blue(default Notion Blue) · indigo · teal · forest(보정 #0f6e3a) · graphite
 * Sunset(#dd5b00)은 Warn 상태색과 hex 충돌로 제외 (2026-05-16 결정).
 *
 * 동작:
 * - aria-checked 정확 표시 (현재 선택)
 * - 키보드: Tab으로 swatch 간 이동, Space/Enter 선택
 * - 색은 hex 하드코딩 (CSS var 의존 X) — 미리보기 swatch이므로 OK
 */

import { useTranslations } from "next-intl";
import { setThemeColor, useThemeColor, THEME_COLOR_IDS, type ThemeColorId } from "./uiPrefs";

const SWATCH_HEX: Record<ThemeColorId, string> = {
  blue: "#0075de",
  indigo: "#5e6ad2",
  teal: "#2a9d99",
  forest: "#0f6e3a",
  graphite: "#171717",
};

export function ThemeColorPicker() {
  const t = useTranslations("Theme");
  const current = useThemeColor();

  return (
    <div
      role="radiogroup"
      aria-label={t("picker.aria")}
      className="flex items-center gap-1.5 px-2 py-1.5"
    >
      {THEME_COLOR_IDS.map((id) => {
        const active = current === id;
        const name = t(`colors.${id}`);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={name}
            title={name}
            onClick={() => setThemeColor(id)}
            className="rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-1"
            style={{
              width: 20,
              height: 20,
              background: SWATCH_HEX[id],
              border: active
                ? "2px solid var(--fg-primary)"
                : "1px solid rgba(0,0,0,0.12)",
              boxShadow: active ? "inset 0 0 0 2px white" : "none",
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}
```

### Step 4.3: 테스트 재실행 (PASS)

- [ ] **테스트 PASS**

```bash
pnpm --filter @jarvis/web exec vitest run apps/web/components/layout/ThemeColorPicker.test.tsx
```

Expected: 5 tests PASS.

### Step 4.4: Commit

- [ ] **커밋**

```bash
git add apps/web/components/layout/ThemeColorPicker.tsx apps/web/components/layout/ThemeColorPicker.test.tsx
git commit -m "feat(theme): add ThemeColorPicker 5-swatch radio group

- 5 swatch (blue/indigo/teal/forest/graphite), aria-checked, 키보드 navigation
- 클릭 시 uiPrefs.setThemeColor 호출 → localStorage + data-theme-color 동기화
- i18n: Theme.colors.{id} + Theme.picker.aria 키 사용
- 5 vitest unit test (TDD)"
```

---

## Task 5: UserMenu 통합 (submenu 활성화)

**Files:**
- Modify: `apps/web/components/layout/UserMenu.tsx` lines 86-97 ("테마 설정 [준비 중]" 버튼)

### Step 5.1: UserMenu에 submenu state + ThemeColorPicker 통합

- [ ] **import 추가 + state hook 추가**

`apps/web/components/layout/UserMenu.tsx` 상단 import 블록 (line 6 다음)에:

```tsx
import { ThemeColorPicker } from "./ThemeColorPicker";
```

`useState`로 `themePickerOpen` 추가. 기존 `const [isLoggingOut, setIsLoggingOut] = useState(false);` (line 14) 다음에:

```tsx
const [themePickerOpen, setThemePickerOpen] = useState(false);
```

- [ ] **"테마 설정 [준비 중]" 버튼 (lines 86-97) 교체**

```tsx
          <button
            type="button"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={themePickerOpen}
            onClick={() => setThemePickerOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-surface-700 transition-colors hover:bg-surface-50"
          >
            <Palette className="h-4 w-4 text-surface-500" />
            <span className="flex-1">{t("themeColor")}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-surface-400 transition-transform",
                themePickerOpen && "rotate-180"
              )}
            />
          </button>
          {themePickerOpen ? (
            <div
              className="my-1 rounded-xl border border-surface-200 bg-surface-50"
              role="region"
              aria-label="Theme color picker"
            >
              <ThemeColorPicker />
            </div>
          ) : null}
```

**주의:**
- `ChevronDown` import는 이미 line 5에 있음 (`{ ChevronDown, LogOut, Palette, UserCircle2 }`)
- `t("themeColor")` 키는 Task 6 i18n 작업에서 추가
- `Badge` import는 더 이상 필요 없으나 다른 곳에서 사용하면 유지. 이 파일 안에서만 쓰였으면 import 제거

- [ ] **Badge import 사용처 재확인**

`apps/web/components/layout/UserMenu.tsx` 전체에서 `Badge` 다른 사용 검색:

```bash
grep -n "Badge" apps/web/components/layout/UserMenu.tsx
```

만약 "테마 설정 [준비 중]" 외 사용 없으면 import 라인에서 제거:

```tsx
// 변경 전: import { Badge } from "@/components/ui/badge";
// 변경 후: (해당 줄 삭제)
```

### Step 5.2: type-check + lint

- [ ] **검증 실행**

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web lint
```

Expected: 둘 다 PASS. `t("themeColor")` 키가 ko.json에 없으면 next-intl 타입 에러 가능 — Task 6 후 재실행.

### Step 5.3: Commit (i18n 키 추가 후)

이 Task의 commit은 Task 6 직후 실행. 키가 없으면 type-check fail.

---

## Task 6: i18n 키 추가 (ko.json + en.json)

**Files:**
- Modify: `apps/web/messages/ko.json`
- Modify: `apps/web/messages/en.json`

### Step 6.1: ko.json에 Theme 네임스페이스 추가

- [ ] **현재 ko.json 최상위 네임스페이스 확인**

```bash
grep -n "^  \"[A-Z]" apps/web/messages/ko.json | head -20
```

새 최상위 키 `"Theme"` 위치 결정 (알파벳 순). 추가:

```json
  "Theme": {
    "picker": {
      "title": "테마 색상",
      "aria": "테마 색상 선택"
    },
    "colors": {
      "blue": "Notion Blue",
      "indigo": "Indigo",
      "teal": "Teal",
      "forest": "Forest",
      "graphite": "Graphite"
    }
  },
```

### Step 6.2: Common.themeColor 키 추가

UserMenu에서 사용하는 `t("themeColor")`는 `Common` 네임스페이스 (useTranslations("Common")). Common 블록에 추가:

- [ ] **`Common` 네임스페이스에 `themeColor` 키 추가**

```bash
grep -n "\"Common\"" apps/web/messages/ko.json
```

`"Common": { ... }` 블록 안에:

```json
    "themeColor": "테마 색상",
```

(기존 키들 사이에 적절한 위치 — 일반적으로 알파벳 또는 의미상 그룹).

### Step 6.3: en.json mirror

- [ ] **en.json에 동일 키 추가** (영문)

```json
  "Theme": {
    "picker": {
      "title": "Theme color",
      "aria": "Select theme color"
    },
    "colors": {
      "blue": "Notion Blue",
      "indigo": "Indigo",
      "teal": "Teal",
      "forest": "Forest",
      "graphite": "Graphite"
    }
  },
```

`Common` 블록에:

```json
    "themeColor": "Theme color",
```

**참고:** `apps/web/i18n/request.ts`가 `locale = 'ko'` 하드코딩이라 en.json은 현재 로드 안 됨. 향후 멀티 로케일 활성화 대비 mirror.

### Step 6.4: 키 사용처 검증

- [ ] **사용처가 정의된 키와 정확히 일치하는지 확인**

```bash
grep -rn "t(\"Theme\." apps/web/components/layout/ThemeColorPicker.tsx
grep -rn "t(\"themeColor\")" apps/web/components/layout/UserMenu.tsx
```

각 호출이 ko.json + en.json의 실제 경로와 일치해야 함.

### Step 6.5: type-check + lint (이제 PASS)

- [ ] **검증 재실행 (Task 5에서 미뤘던 것)**

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web lint
```

Expected: 둘 다 PASS.

### Step 6.6: Commit (UserMenu + i18n 함께)

- [ ] **커밋**

```bash
git add apps/web/components/layout/UserMenu.tsx apps/web/messages/ko.json apps/web/messages/en.json
git commit -m "feat(usermenu): activate 테마 설정 submenu with ThemeColorPicker + i18n keys

- UserMenu '테마 설정 [준비 중]' → 활성 submenu 트리거 (aria-haspopup/expanded)
- 클릭 시 5 swatch picker 렌더, ChevronDown rotation
- i18n: Common.themeColor + Theme.picker.{title,aria} + Theme.colors.{blue,indigo,teal,forest,graphite} (ko + en mirror)
- Badge import 제거 (준비 중 배지 더 이상 불필요)"
```

---

## Task 7: E2E 테스트

**Files:**
- Create: `apps/web/e2e/theme-picker.spec.ts`
- Modify (optional): `apps/web/e2e/sidebar-rbac.spec.ts` (active state DOM 변경 영향)

### Step 7.1: 신규 theme-picker.spec.ts

- [ ] **`apps/web/e2e/theme-picker.spec.ts` 신설**

```ts
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Theme color picker", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/dashboard");
  });

  test("기본 테마 = blue, data-theme-color attribute 세팅됨", async ({ page }) => {
    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme-color", "blue");
  });

  test("UserMenu → 테마 설정 클릭 → 5 swatch 노출", async ({ page }) => {
    // UserMenu 트리거 (사용자 이름 표시 버튼)
    await page.getByRole("button", { name: /Admin User/i }).click();
    // 테마 설정 submenu 트리거
    await page.getByRole("menuitem", { name: /테마 색상/ }).click();
    // 5 swatch 노출 확인
    const radioGroup = page.getByRole("radiogroup", { name: /테마 색상 선택/ });
    await expect(radioGroup).toBeVisible();
    const radios = radioGroup.getByRole("radio");
    await expect(radios).toHaveCount(5);
  });

  test("Forest 선택 → data-theme-color + localStorage 업데이트", async ({ page }) => {
    await page.getByRole("button", { name: /Admin User/i }).click();
    await page.getByRole("menuitem", { name: /테마 색상/ }).click();
    await page.getByRole("radio", { name: "Forest" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme-color", "forest");
    const stored = await page.evaluate(() => window.localStorage.getItem("jv.themeColor"));
    expect(stored).toBe("forest");
  });

  test("페이지 reload 후에도 선택 테마 유지 (localStorage 영속)", async ({ page }) => {
    await page.getByRole("button", { name: /Admin User/i }).click();
    await page.getByRole("menuitem", { name: /테마 색상/ }).click();
    await page.getByRole("radio", { name: "Indigo" }).click();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme-color", "indigo");
  });

  test("사이드바 active 항목이 brand-primary 색 적용 (CSS var 검증)", async ({ page }) => {
    // 대시보드 active 상태에서 활성 메뉴 항목 computed style 확인
    const dashboardItem = page.getByRole("link", { name: /대시보드/, exact: false }).first();
    const bgColor = await dashboardItem.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    // brand-primary-bg = color-mix 결과. 정확한 hex 검증보다는 transparent/투명 아님 확인
    expect(bgColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(bgColor).not.toBe("transparent");
  });
});
```

**주의:** `loginAsAdmin` 헬퍼는 기존 e2e 패턴 따름. 없으면 `apps/web/e2e/helpers/auth.ts` 확인 후 매칭. 만약 헬퍼 이름이 다르면 (`signInAsAdmin` 등) 맞는 것 사용.

- [ ] **helpers/auth.ts 확인**

```bash
ls apps/web/e2e/helpers/ 2>&1 || ls apps/web/e2e/ | head
grep -l "loginAs\|signIn\|seedAdmin" apps/web/e2e/**/*.ts | head
```

함수명을 실제 helper에 맞춰 조정.

### Step 7.2: 기존 sidebar-rbac.spec.ts 영향 검증

- [ ] **active state 셀렉터·스타일 검증 부분 확인**

```bash
grep -nE "active|aria-current|line2|brand-primary" apps/web/e2e/sidebar-rbac.spec.ts
```

만약 active state의 background color나 컴퓨티드 스타일을 hard-coded `var(--line2)` 같은 값으로 검증하는 곳이 있으면, `--brand-primary-bg`로 변경된 새 값으로 수정. snapshot 기반이면 snapshot 갱신.

이 스킬은 실행 단계에서만 발견 가능 — implementer가 e2e 실행 결과 보고 수정.

### Step 7.3: e2e 실행

- [ ] **신규 spec 실행**

```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/theme-picker.spec.ts
```

Expected: 5 tests PASS.

- [ ] **sidebar 회귀 실행**

```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/sidebar-rbac.spec.ts
```

Expected: 기존 모두 PASS. 실패 시 active state 검증 셀렉터 조정.

### Step 7.4: Commit

- [ ] **커밋**

```bash
git add apps/web/e2e/theme-picker.spec.ts apps/web/e2e/sidebar-rbac.spec.ts
git commit -m "test(e2e): theme-picker 5 시나리오 + sidebar-rbac active 시각 회귀

- theme-picker: 기본 blue / submenu open / Forest 선택 / reload 영속 / brand-primary CSS 검증
- sidebar-rbac: active state DOM 변경 영향 흡수 (셀렉터 조정)"
```

---

## Task 8: 검증 게이트 일괄 + 사용자 dogfooding

### Step 8.1: 검증 게이트 (jarvis-architecture 명시)

- [ ] **type-check 2회 연속** (메모리 `feedback_test_twice.md` 정책)

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check
```

Expected: 둘 다 PASS.

- [ ] **lint 2회**

```bash
pnpm --filter @jarvis/web lint && pnpm --filter @jarvis/web lint
```

Expected: 둘 다 PASS. 기존 unused-var WARN만, ERROR 0.

- [ ] **unit test (관련 범위 좁혀)**

```bash
pnpm --filter @jarvis/web exec vitest run apps/web/components/layout/uiPrefs.test.ts apps/web/components/layout/ThemeColorPicker.test.tsx
```

Expected: 11 tests PASS (uiPrefs 6 + ThemeColorPicker 5).

- [ ] **audit:rsc** (RSC 경계 변경 없으나 안전망)

```bash
pnpm audit:rsc
```

Expected: ERROR 0. WARN baseline 동일 (변경 없음).

- [ ] **빌드** (CSS layer 충돌 / Tailwind 토큰 인식 검증)

```bash
pnpm --filter @jarvis/web build
```

Expected: 빌드 성공, 전체 라우트 컴파일.

- [ ] **e2e (변경 범위 좁혀)**

```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/theme-picker.spec.ts apps/web/e2e/sidebar-rbac.spec.ts
```

Expected: 모두 PASS.

### Step 8.2: 사용자 dogfooding 요청

- [ ] **dev 서버에서 다음 시나리오 직접 확인 요청**

dev 서버 실행:

```bash
pnpm --filter @jarvis/web dev
```

사용자에게 확인 요청:

1. `/dashboard` 접속 → 페이지 배경 warm-50 / 카드 + 사이드바 + 탑바 순백 확인
2. `/holidays` 접속 → 그리드 헤더 + 검색 패널 순백, 사용자 사진1의 회색이 사라졌는지
3. UserMenu (우상단) → "테마 색상" 클릭 → 5 swatch 노출 확인
4. 각 swatch 클릭 → 사이드바 active 항목 색 / 1차 CTA 버튼 / focus ring 색 변경 확인
5. Forest 테마 + Done chip(완료) 색이 명확히 구분되는지 (어두운 emerald vs 밝은 lime-green)
6. 브라우저 새로고침 → 선택한 테마 유지
7. 시스템 다크모드 토글 (Moon 아이콘) → 5테마 다크에서도 시각 OK
8. Graphite 다크 → 흰색(`#f5f5f5`)으로 반전 확인

문제 보고 시 plan 해당 task에서 fix loop.

### Step 8.3: Commit (변경 없으면 skip)

dogfooding에서 추가 수정 발생 시 별도 커밋.

---

## Task 9: 문서 + 마감

### Step 9.1: CLAUDE.md 변경 이력 추가

- [ ] **`CLAUDE.md`의 "변경 이력" 표 끝에 1줄 추가**

```markdown
| 2026-05-16 | **디자인 시스템 도입** — Q5=B swap(페이지 warm-50, 카드/chrome 순백) + brand-primary `color-mix()` 파생 + 5테마 picker(Notion Blue/Indigo/Teal/Forest `#0f6e3a`/Graphite) + 사이드바 active 시각 갱신(brand-primary 틴트 + 3px indicator) + 다크테마 동일 적용 + i18n(ko/en). Sunset `#dd5b00`은 Warn 충돌로 제외. | `apps/web/app/globals.css`, `apps/web/components/layout/{Sidebar,UserMenu,uiPrefs,ThemeColorPicker}.tsx`, `apps/web/messages/{ko,en}.json`, `apps/web/e2e/theme-picker.spec.ts` | mockup 2회 검증(`.local/design-preview/theme-collision-mockup.html`) 후 사용자 결정 11건 기반. Sunset 제외 사유 = `#dd5b00 ≡ --color-orange` 완전 동일 hex. Forest 보정 `#1f883d → #0f6e3a` (어두운 emerald, Done chip과 명도 분리). plan: `docs/superpowers/plans/2026-05-16-design-system-adoption.md` |
```

### Step 9.2: Commit + 브랜치 마감 위임

- [ ] **CLAUDE.md 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 변경 이력 — 디자인 시스템 도입 (2026-05-16)"
```

- [ ] **superpowers:finishing-a-development-branch 호출**

브랜치 마감(머지 / PR) 결정은 그 스킬에 위임. 이 plan 범위 밖.

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Q5=B swap → Task 1.1, 1.2
- ✅ 5테마 color-mix 파생 → Task 1.1
- ✅ data-theme-color 5블록 (light) → Task 1.3
- ✅ 다크테마 5테마 + Graphite 반전 → Task 1.4, 1.5
- ✅ 사이드바 active brand-primary 틴트 + 3px indicator → Task 2.1
- ✅ useThemeColor hook + localStorage → Task 3
- ✅ ThemeColorPicker 컴포넌트 → Task 4
- ✅ UserMenu submenu (Q4=B) → Task 5
- ✅ i18n ko/en 키 → Task 6
- ✅ E2E 영속/active 시각 → Task 7
- ✅ Sunset 제외 / Forest `#0f6e3a` 보정 → Task 1.3, 1.4
- ✅ Status chip 형태 / shadow-soft / border 0.10 변경 없음 (현재 유지)
- ✅ 단일 PR → Task 9.2 위임

**2. Placeholder scan:** 없음. 모든 step에 코드 블록 + 명령 + expected 결과 명시.

**3. Type consistency:**
- `ThemeColorId` 타입 = `THEME_COLOR_IDS[number]` (Task 3.2)
- `setThemeColor(color: ThemeColorId)` ↔ `useThemeColor(): ThemeColorId` 일관 (Task 3.2)
- `SWATCH_HEX: Record<ThemeColorId, string>` (Task 4.2) — `ThemeColorId` 타입 사용
- localStorage key `jv.themeColor` 모든 곳 일관 (Task 3.2, 3.3, 7.1)
- i18n 네임스페이스 `Theme.colors.{id}` (id ∈ `ThemeColorId`) (Task 4.2, 6.1)
- `Common.themeColor` (Task 5.1, 6.2)

**4. 영향도 매트릭스 검증:**
- DB / 권한 / Audit / wiki-fs / Ask AI / 워커 등 비대상 계층 모두 "없음" 명시
- 변경 4계층(UI 컴포넌트 · i18n · 테스트 · CSS 토큰) 모두 task 매핑
- jarvis-architecture 파일 변경 순서(15→16→19) 준수

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-design-system-adoption.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task + two-stage review (spec-reviewer + code-quality-reviewer). 작업 9개를 task 단위로 디스패치, 각 task 후 리뷰 루프. 시각 dogfooding(Task 8.2)은 사용자 협력 필수.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. 빠르지만 task 간 리뷰는 제한적.

**Which approach?**
