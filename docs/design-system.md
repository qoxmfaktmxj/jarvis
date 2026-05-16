# Jarvis · Design System v4 — Notion-aligned Hybrid + Themed

> **v3 문서는 `git log docs/design-system.md`에서 확인.**
> **2026-05-16 갱신:** 3-tier bg 토큰(`--bg-canvas` warm-50 페이지 / `--bg-page` #fff chrome+card / `--bg-surface` warm-50 subtle tint) + `color-mix` 파생 + 5테마 picker.
> **Canonical spec:** `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`
> **2026-05-16 plan:** `docs/superpowers/plans/2026-05-16-design-system-adoption.md`
> **Mockup 검증:** `.local/design-preview/theme-collision-mockup.html`
> **Previews:** `docs/superpowers/specs/previews/*.html`

## 0. 이 문서 사용법

새 화면 만들거나 기존 화면 리튠할 때 **먼저 이 문서를 읽고**, 필요 시
spec을 파고든다. Phase 2 화면 리튠의 standing reference.

---

## 1. 핵심 원칙 (한 줄 요약)

> **Notion chrome (warm-50 페이지 + 순백 카드/chrome + whisper borders + 5-테마 brand-primary)
> + 엔터프라이즈 밀도 유지. Pretendard Variable. Lime 금지 (graph 제외).**

- **페이지 배경은 `--bg-canvas` (`#faf9f8` warm-50, 따뜻한 캔버스) — body에 적용**
- **카드 + chrome 배경은 `--bg-page` (`#ffffff` 순백, 페이지 위로 올라온 것)**
- **`--bg-surface`는 subtle warm tint** (`#faf9f8`, code chip / 카드 header 내부 seam 등 한정)
- 섹션 교대 배경 금지, 리듬은 보더·shadow·간격으로만
- Primary CTA·링크·focus·active 색은 오직 `--brand-primary` (단일 SoT)
  - hover/bg/text는 `color-mix(in oklab, ...)`로 자동 파생
  - 사용자가 `data-theme-color` 5개 중 선택 → 모든 곳에 자동 cascade
- Red `#dc2626`만 destructive·error에
- 한글 블록에 음수 letter-spacing 금지 (`:lang(ko)` selector 사용)

## 2. 3-Tier 밀도 모델

| Tier | 용도 | Body | H1/Hero | Card radius | Card shadow |
|---|---|---|---|---|---|
| **T1 Spacious** | Wiki 본문, Ask AI 대화, Login, 404 | 16px/1.7 | 48px/700/-1.5px | 12-16px | shadow-soft |
| **T2 Balanced** | KPI, 요약 카드, 리스트 | 13-14px/1.5 | 30px/700/-0.625px | 10-12px | shadow-soft |
| **T3 Dense** | 테이블, 폼, 어드민 | 13-13.5px/1.5 | 14px/600 | 8px | shadow-flat |

화면별 매핑은 spec §8 참조.

## 3. 주요 토큰

(raw 값은 `apps/web/app/globals.css`에서 SSoT. 여기선 role만.)

```css
--bg-canvas (warm-50)              ← 페이지 캔버스, body 적용 (2026-05-16 canvas 도입)
--bg-page (#fff)                   ← chrome/card body, 기존 elevated 의미 유지
--bg-surface (warm-50)             ← subtle tint, code chip/카드 header 내부 seam
--fg-primary / --fg-secondary / --fg-muted
--brand-primary                                ← 단일 SoT, 테마 picker로 override
--brand-primary-hover    ← color-mix(in oklab, --brand-primary 80%, black 20%)  /* light */
--brand-primary-bg       ← color-mix(in oklab, --brand-primary  8%, white 92%)  /* light */
--brand-primary-text     ← var(--brand-primary)                                 /* light */
                          (dark는 white-mix로 dim — globals.css §dark block 참조)
--border-default / --border-soft / --border-focus(= --brand-primary)
--status-{done,success,active,warn,danger,neutral,decorative-{pink,purple,brown}}-{bg,fg}
                          ← semantic 고정. 5테마 picker에 따라가지 않음.
--shadow-soft / --shadow-deep / --shadow-flat
--color-red-{50,200,500}
--color-info / --color-info-subtle             ← semantic 고정 (테마 cascade X)
--graph-node-{1..6}                            ← UI 금지, graph 시각화 전용
```

### 3.1. 5테마 picker (data-theme-color)

`document.documentElement.dataset.themeColor` 5개 값 중 하나:

| ID | hex (light) | hex (dark) | 비고 |
|---|---|---|---|
| `blue` | `#0075de` | `#0075de` | 기본 (Notion Blue) |
| `indigo` | `#5e6ad2` | `#5e6ad2` | Linear/Vercel 결 |
| `teal` | `#2a9d99` | `#2a9d99` | wiki/knowledge 결 |
| `forest` | `#0f6e3a` | `#0f6e3a` | 어두운 emerald (Done chip과 명도 분리) |
| `graphite` | `#171717` | `#f5f5f5` | 모노크롬 (다크 bg 충돌로 반전) |

**Sunset(`#dd5b00`) 제외 사유**: `--color-orange` Warn 상태색과 hex 완전 동일 → CTA = 경고 의미 충돌. hex 보정 불가(빨강쪽 → Danger, 노랑쪽 → Warn 그대로).

picker UI는 `apps/web/components/layout/ThemeColorPicker.tsx`에서 5 swatch radio group. localStorage `jv.themeColor`로 영속. FOUC 방지 inline script(`UI_PREFS_BOOTSTRAP`)가 hydration 전 `data-theme-color` 세팅. UserMenu(우상단) → "테마 색상" submenu에서 선택.

### Contrast matrix (WCAG AA)

| Token | Light on `--bg-page` | Dark on `--bg-page` | Use |
|---|---|---|---|
| `--fg-primary` | ~18:1 (AAA) | ~16:1 (AAA) | Body text, headings |
| `--fg-secondary` | ~5.5:1 (AA) | ~5.3:1 (AA) | Helper text, meta |
| `--fg-muted` | ~2.5:1 (FAIL) | ~3.6:1 (FAIL) | **Placeholder/decorative only — never body text** |
| `--brand-primary-text` | ~4.6:1 (AA large) | ~6.2:1 (AA) | Links, focus |

**Rule:** never use `--fg-muted` for text users need to read. Use it for placeholders, disabled states, and decorative ornaments only.

## 4. 패턴 헬퍼 (항상 이걸 써라)

- `StatusChip` (`components/patterns/StatusChip.tsx`) — 상태 칩
- `PriorityChip` (`components/patterns/PriorityChip.tsx`) — P1/P2/P3
- `Field` (`components/patterns/Field.tsx`) — 폼 필드 래퍼
- `NativeSelect` (`components/patterns/NativeSelect.tsx`) — T3 네이티브 select

## 5. 신 화면 체크리스트

- [ ] 이 화면은 T1/T2/T3 중 어느 tier인가? 결정 후 해당 tier 스케일 따름
- [ ] 페이지 루트는 unset (body가 --bg-canvas 자동 적용)
- [ ] 카드는 `bg-[--bg-page] border border-[--border-default] rounded-{lg|xl} shadow-[var(--shadow-{flat|soft})]` (순백 + warm 페이지 위로 떠보임)
- [ ] 카드 header/footer subtle seam 원하면 `bg-[--bg-surface]` 추가 (warm-50 tint)
- [ ] 버튼은 shadcn `<Button>` — variant로 색 제어
- [ ] 칩은 `<StatusChip>` 또는 `<PriorityChip>` — 직접 className 만들지 말 것
- [ ] 폼 필드는 `<Field label="…">` 로 감쌈
- [ ] 숫자가 들어가는 셀은 `tabular-nums` 기본 (body 단위에서 자동 적용됨)
- [ ] 아이콘은 `lucide-react` 전용, 크기 tier별(§6.4)

## 6. 금지 사항 (하지 마)

- ❌ 인라인 hex/rgb 컬러 (`#2b5bff`, `rgb(...)`) — 토큰만
- ❌ `bg-isu-*`, `text-surface-*`, `bg-lime-*` (Phase 2에서 전부 제거, 새 작업엔 쓰지 말 것)
- ❌ `rounded-2xl`/`rounded-3xl` — T1 hero 카드(`rounded-xl` 16px)만 예외
- ❌ `bg-card` 토큰 (deprecated) — `bg-[--bg-page]` 또는 `bg-white` 사용 (카드는 #fff, 페이지는 warm-50 via --bg-canvas)
- ❌ `text-rose-*` — red는 `text-[--color-red-500]`로 통일
- ❌ `shadow-lg`+ — `shadow-[var(--shadow-deep)]`만 예외 (모달)
- ❌ 배경색 교대 (`bg-surface-100` 섹션 배경) — page=warm-50, card=#fff 외 다른 톤 금지
- ❌ `--brand-primary*` 토큰 우회 (hex 직접 하드코딩) — 테마 picker cascade 끊김. brand 의도면 토큰만 사용
- ❌ Lime 색상 (그래프 제외)
- ❌ 호버 시 `scale(1.05)` / `scale(0.9)` — 내부 툴에 과함

## 7. 다크 모드 + 테마

- `:root[data-theme="dark"]` 자동 오버라이드. 토큰이 모두 dark-aware라 새 코드에서 추가 작업 불필요.
- `:root[data-theme-color={blue|indigo|teal|forest|graphite}]` 5블록(light + dark 각각). `--brand-primary` 한 줄만 override → hover/bg/text는 `color-mix`로 자동 따라감.
- **토글/picker UI**: Topbar 우상단 Moon/Sun(라이트↔다크) + UserMenu dropdown "테마 색상" submenu (5 swatch radio).
- localStorage 영속: `jv.theme` (light/dark) + `jv.themeColor` (5 ID 중 하나).
- FOUC 방지: `UI_PREFS_BOOTSTRAP` inline script가 hydration 전 `<html data-theme/data-sidebar/data-theme-color>` 일괄 세팅.

## 8. 다국어

- 한글은 `font-feature-settings: "ss01", "tnum", "lnum"` + letter-spacing 0
- 음수 letter-spacing은 Latin/숫자에만: `.hero-title:lang(ko) { letter-spacing: 0 }`
- 모든 UI 텍스트는 `apps/web/messages/{ko,en}.json`

## 9. 참고 링크

- Spec: `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`
- Previews: `docs/superpowers/specs/previews/*.html`
- Phase 1 구현 플랜: `docs/superpowers/plans/2026-04-24-design-overhaul-phase-1.md`
- **v4 — 디자인 시스템 도입 plan (2026-05-16)**: `docs/superpowers/plans/2026-05-16-design-system-adoption.md`
- **v4 — mockup 검증 (Q5=B + 5테마 충돌)**: `.local/design-preview/theme-collision-mockup.html` (gitignored)
