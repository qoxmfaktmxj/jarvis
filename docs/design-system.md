# Jarvis · Design System v3 — Notion-aligned Hybrid

> **v2 문서는 `git log docs/design-system.md`에서 확인.**
> **Canonical spec:** `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`
> **Previews:** `docs/superpowers/specs/previews/*.html`

## 0. 이 문서 사용법

새 화면 만들거나 기존 화면 리튠할 때 **먼저 이 문서를 읽고**, 필요 시
spec을 파고든다. Phase 2 화면 리튠의 standing reference.

---

## 1. 핵심 원칙 (한 줄 요약)

> **Notion chrome (warm neutrals + pure white + whisper borders + Notion Blue)
> + 엔터프라이즈 밀도 유지. Pretendard Variable. Lime 금지 (graph 제외).**

- 페이지 배경은 `--bg-page` (pure white)
- 섹션 교대 배경 금지, 리듬은 보더·shadow·간격으로만
- Primary CTA·링크·focus 색은 오직 `--brand-primary` (Notion Blue `#0075de`)
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
--bg-page / --bg-surface
--fg-primary / --fg-secondary / --fg-muted
--brand-primary / --brand-primary-hover / --brand-primary-bg / --brand-primary-text
--border-default / --border-soft / --border-focus
--status-{done,success,active,warn,danger,neutral,decorative-{pink,purple,brown}}-{bg,fg}
--shadow-soft / --shadow-deep / --shadow-flat
--color-red-{50,200,500}
--graph-node-{1..6}  ← UI 금지, graph 시각화 전용
```

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
- [ ] 페이지 루트는 `bg-[--bg-page]` 또는 unset (자동 흰색)
- [ ] 카드는 `bg-white border border-[--border-default] rounded-{lg|xl} shadow-[var(--shadow-{flat|soft})]`
- [ ] 버튼은 shadcn `<Button>` — variant로 색 제어
- [ ] 칩은 `<StatusChip>` 또는 `<PriorityChip>` — 직접 className 만들지 말 것
- [ ] 폼 필드는 `<Field label="…">` 로 감쌈
- [ ] 숫자가 들어가는 셀은 `tabular-nums` 기본 (body 단위에서 자동 적용됨)
- [ ] 아이콘은 `lucide-react` 전용, 크기 tier별(§6.4)

## 6. 금지 사항 (하지 마)

- ❌ 인라인 hex/rgb 컬러 (`#2b5bff`, `rgb(...)`) — 토큰만
- ❌ `bg-isu-*`, `text-surface-*`, `bg-lime-*` (Phase 2에서 전부 제거, 새 작업엔 쓰지 말 것)
- ❌ `rounded-2xl`/`rounded-3xl` — T1 hero 카드(`rounded-xl` 16px)만 예외
- ❌ `bg-card` 토큰 (deprecated) — `bg-white` 또는 `bg-[--bg-page]` 사용
- ❌ `text-rose-*` — red는 `text-[--color-red-500]`로 통일
- ❌ `shadow-lg`+ — `shadow-[var(--shadow-deep)]`만 예외 (모달)
- ❌ 배경색 교대 (`bg-surface-100` 섹션 배경) — pure white만
- ❌ Lime 색상 (그래프 제외)
- ❌ 호버 시 `scale(1.05)` / `scale(0.9)` — 내부 툴에 과함

## 7. 다크 모드

`:root[data-theme="dark"]` 자동 오버라이드. 토큰이 모두 dark-aware라 새 코드에서 추가 작업 불필요.

토글 UI는 Phase 2에서 추가.

## 8. 다국어

- 한글은 `font-feature-settings: "ss01", "tnum", "lnum"` + letter-spacing 0
- 음수 letter-spacing은 Latin/숫자에만: `.hero-title:lang(ko) { letter-spacing: 0 }`
- 모든 UI 텍스트는 `apps/web/messages/{ko,en}.json`

## 9. 참고 링크

- Spec: `docs/superpowers/specs/2026-04-24-design-overhaul-design.md`
- Previews: `docs/superpowers/specs/previews/*.html`
- Phase 1 구현 플랜: `docs/superpowers/plans/2026-04-24-design-overhaul-phase-1.md`
