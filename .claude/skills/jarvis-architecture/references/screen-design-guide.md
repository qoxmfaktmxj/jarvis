# 화면 설계 종합 가이드 (Screen Design Guide)

**모든 (app) 라우트 신규 화면이 이 가이드를 따라야 한다.** 디자이너/개발자 누구든 이 문서만 보고 일관된 화면을 만들 수 있도록 actionable skeleton·token·decision tree·anti-pattern·체크리스트를 모두 포함한다.

본문 그리드 화면은 [grid-standard.md](./grid-standard.md) 추가 참조.

---

## 1. 페이지 anatomy

```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Topbar (var(--topbar-height) = 47px)               │
│ (var(  ├──────────────────────────────────────────────────────┤
│ --side  │ AppShellMain wrapper                                │
│ bar-    │  ┌──────────────────────────────────────────────┐  │
│ width)  │  │  pt-10 (40px) ── 단일 진실 SoT               │  │
│  60     │  │  ┌────────────────────────────────────────┐  │  │
│  ~220   │  │px│  PageShell / PageShellFit               │px│  │
│  px)    │  │10│  ├──────────────────────────────────┐   │10│  │
│         │  │  │  │ PageHeader (title + actions)     │   │  │  │
│         │  │  │  │  - h1 30px bold                  │   │  │  │
│         │  │  │  │  - actions 우측 정렬             │   │  │  │
│         │  │  │  ├──── gap-3 (12px) ───────────────┤   │  │  │
│         │  │  │  │ children                         │   │  │  │
│         │  │  │  │   (그리드 / 폼 / 본문 등)        │   │  │  │
│         │  │  │  └──────────────────────────────────┘   │  │  │
│         │  │  pb-5 (20px) ─ 위의 50% ─                  │  │  │
│         │  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**max-w**: `calc(1700px + (220px - var(--sidebar-width)))` — sidebar rail(60px)면 1860, expanded(220px)면 1700. 즉 사이드바 닫으면 컨텐츠 폭이 자동 확장.

---

## 2. 3가지 화면 종류 + 결정 트리

```
이 화면이 표시할 데이터는?
├── DataGrid / 채팅 / 실시간 UI / viewport-fit 필요  → PageShellFit
│       (페이지 자체 스크롤 X, 내부 위젯만 스크롤)
├── 긴 본문 (knowledge / wiki / notice 상세) → PageShell
│       (자연 height + 페이지 자체 스크롤)
└── 폼 / 짧은 list / 자연 height                    → PageShell
```

| 종류 | wrapper | 예시 |
|------|--------|------|
| **A. 그리드 페이지** | `PageShellFit` | admin/companies, sales/*, projects/page, holidays |
| **B. 본문 페이지** | `PageShell` | knowledge/[id], notices/[id], wiki/[...path] |
| **C. 폼 페이지** | `PageShell` | knowledge/[id]/edit, notices/new, projects/new |

---

## 3. 화면 종류별 skeleton 템플릿

### A. 그리드 페이지 skeleton

```tsx
// apps/web/app/(app)/example/page.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { requirePageSession } from "@/lib/server/page-auth";
import { listExample } from "./actions";
import { ExampleGridContainer } from "./_components/ExampleGridContainer";

export const dynamic = "force-dynamic";

export default async function ExamplePage() {
  const session = await requirePageSession(PERMISSIONS.EXAMPLE_READ, "/dashboard");
  const t = await getTranslations("Example");
  const initial = await listExample({ workspaceId: session.workspaceId, page: 1, limit: 50 });
  const canCreate = hasPermission(session, PERMISSIONS.EXAMPLE_CREATE);

  return (
    <PageShellFit
      title={t("title")}
      actions={
        canCreate ? (
          <Button asChild>
            <Link href="/example/new">{t("new")}</Link>
          </Button>
        ) : null
      }
    >
      <ExampleGridContainer
        initial={initial.rows}
        total={initial.total}
      />
    </PageShellFit>
  );
}
```

GridContainer 자체는 [grid-standard.md](./grid-standard.md) 1~9절 따름. 핵심: container 최상단 wrapper는 `<div className="flex h-full min-h-0 flex-col gap-3">` (PageShellFit 아래에서 viewport-fit 받기).

### B. 본문 페이지 skeleton

```tsx
// apps/web/app/(app)/example/[id]/page.tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { getExample } from "@/lib/queries/example";

export default async function ExampleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePageSession();
  const t = await getTranslations("Example");
  const row = await getExample({ workspaceId: session.workspaceId, id });
  if (!row) notFound();

  return (
    <PageShell title={row.title}>
      <article className="prose max-w-none">
        {/* 본문 콘텐츠 — prose 토큰만 사용 */}
        {row.content}
      </article>
    </PageShell>
  );
}
```

### C. 폼 페이지 skeleton

```tsx
// apps/web/app/(app)/example/new/page.tsx
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/patterns/PageShell";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requirePageSession } from "@/lib/server/page-auth";
import { ExampleForm } from "./_components/ExampleForm";

export default async function ExampleNewPage() {
  await requirePageSession(PERMISSIONS.EXAMPLE_CREATE, "/example");
  const t = await getTranslations("Example");

  return (
    <PageShell title={t("new")}>
      <ExampleForm />
    </PageShell>
  );
}
```

---

## 4. 디자인 토큰 카탈로그

### 4-1. 외곽 여백 (AppShellMain SoT, 절대 다른 곳에서 변경 금지)

| 항목 | 값 | Tailwind |
|------|---|---------|
| pt (위) | 40px | `pt-10` |
| pb (아래) | 20px (위의 50%) | `pb-5` |
| px (좌우) | 40px | `px-10` |
| max-w | 1700 ~ 1860px (sidebar 반응) | `style={{ maxWidth: "calc(1700px + (220px - var(--sidebar-width)))" }}` |

### 4-2. PageShell 내부 간격

| 항목 | 값 |
|------|---|
| gap (PageHeader ↔ children) | `gap-3` (12px) |
| children 사이 추가 spacing | 필요 시 `space-y-3` 또는 `gap-3` (직접 padding X) |

### 4-3. 입력 토큰 (filter form `<select>` / `<input>` / DataGrid filter)

**표준** (변경 금지):
```tsx
className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
```

**금지** (옛 shadcn 기본):
```tsx
// ❌ NO
className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
```

### 4-4. 라벨 토큰

```tsx
className="text-[12px] font-medium text-(--fg-primary)"
```

`<GridFilterField>` 사용 시 자동 적용. 직접 작성 시 위 토큰만.

### 4-5. 버튼 (shadcn `<Button>` variant)

| variant | 용도 |
|---------|------|
| `default` (primary) | 저장·확인·신규 등 주요 액션 (1개만 권장) |
| `outline` | 보조 액션 (조회·다운로드·취소) |
| `ghost` | 텍스트 액션 (× 닫기, 더보기) |
| `destructive` | 삭제 등 위험 액션 (사용자 확인 필수) |

size: `default`(h-10) / `sm`(h-8). 그리드 페이지 toolbar는 일반적으로 `sm`.

### 4-6. 색상 토큰 (CSS 변수)

| 변수 | 용도 |
|------|------|
| `--bg-page` | 페이지 배경 (입력/select bg) |
| `--bg-surface` | 카드/패널 배경 |
| `--fg-primary` | 본문 텍스트 |
| `--fg-secondary` | 보조 텍스트 (13px secondary label) |
| `--fg-muted` | 흐린 텍스트 (timestamp, 메타) |
| `--border-default` | 표준 테두리 |
| `--border-focus` | focus ring |
| `--brand-primary` | 강조 색 |
| `--brand-primary-bg` | 강조 배경 (tab active 등) |
| `--brand-primary-text` | 강조 텍스트 |

**금지**: `bg-blue-500`, `text-red-600`, `border-slate-300` 등 raw Tailwind 색상. 위 CSS 변수만.

### 4-7. 타이포그래피

| 용도 | 토큰 |
|------|------|
| 페이지 h1 | `text-[30px] font-bold leading-tight tracking-[-0.02em] text-(--fg-primary)` (PageHeader 표준) |
| 섹션 h2 | `text-sm font-semibold text-(--fg-primary)` |
| 본문 | `text-[13px] text-(--fg-primary)` |
| 보조 | `text-[12px] text-(--fg-secondary)` |
| 흐림 | `text-[11px] text-(--fg-muted)` |

---

## 5. 헤더 패턴

```tsx
// ✅ YES — PageShell의 title + actions prop만 사용
<PageShell title="제목" actions={<Button>액션</Button>}>
  ...
</PageShell>

// ❌ NO — 자체 <h1>·<header> 렌더
<PageShell>
  <h1 className="text-2xl">제목</h1>
  ...
</PageShell>
```

**actions 슬롯 규칙**:
- 1~3 버튼이 적정. 4+면 dropdown으로 묶기.
- 가장 중요한 액션 1개만 primary (`<Button>`), 나머지 outline.
- 자체 wrapper로 actions 좌우 정렬 변경 금지 — PageHeader가 자동 우측 정렬.

---

## 6. Filter form 패턴 (그리드 페이지)

```tsx
<GridSearchForm
  onSearch={() => reload(1, pendingFilters)}
  onResetGrid={() => gridApiRef.current?.discardChanges()}  // required
  isSearching={isSearching}
>
  <GridFilterField label="구분" className="w-[140px]">
    <select
      value={pendingFilters.type ?? ""}
      onChange={(e) => setPending("type", e.target.value)}
      className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
    >
      <option value="">전체</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </GridFilterField>
  <GridFilterField label="키워드" className="w-[210px]">
    <Input
      value={pendingFilters.q ?? ""}
      onChange={(e) => setPending("q", e.target.value)}
      placeholder="..."
      className="h-8"
    />
  </GridFilterField>
</GridSearchForm>
```

자체 form/`<label>` 작성 금지. `GridSearchForm` + `GridFilterField`만.

---

## 7. 화면별 책임 분리 (파일 구조)

```
apps/web/app/(app)/example/
├─ page.tsx              # RSC 진입 (auth + data fetch + PageShell wrap)
├─ actions.ts            # "use server" — listExample / saveExample
├─ _components/
│  ├─ ExampleGridContainer.tsx   # client orchestrator (필터/페이지/dirty)
│  ├─ ExampleForm.tsx            # client form
│  └─ ExampleTable.tsx           # (RSC table 필요 시)
├─ [id]/
│  ├─ page.tsx                   # 상세 (RSC)
│  └─ edit/page.tsx              # 폼 (RSC)
└─ new/page.tsx                  # 신규 폼

apps/web/lib/queries/example.ts  # server-side fetch helper (page.tsx + actions 공용)
```

**핵심 규칙**:
- page.tsx에 비즈니스 로직 X. 권한 가드 + data fetch + wrapper만.
- 클라이언트 상태는 `_components/*Container.tsx`에 집중.
- 도메인 횡단 server action은 `apps/web/app/actions/`로.

---

## 8. layout.tsx 규칙

```tsx
// ✅ YES — 권한·데이터 가드만, fragment 패스
export default async function ExampleLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession(PERMISSIONS.EXAMPLE_READ, "/dashboard");
  return <>{children}</>;
}

// ✅ YES — header/tabs 필요 시 PageShell 패턴 따름 (gap-3 + h-full + overflow-hidden)
export default async function ExampleDetailLayout({ children, params }) {
  const { id } = await params;
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <PageHeader title="외주인력관리" />
      <ExampleTabs id={id} />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// ❌ NO — <main>·padding·max-w·mx-auto·overflow wrapper
export default async function ExampleLayout({ children }) {
  return <main className="overflow-auto p-8 max-w-1400 mx-auto">{children}</main>;
}
```

**절대 금지**:
- `<main>` 태그 (AppShellMain이 이미 `<main id="main-content">` 사용 — nested = a11y 위반)
- `padding`/`max-w`/`mx-auto`/`overflow` wrapper
- 인라인 style padding

---

## 9. 금지 패턴 (Anti-patterns)

PR 반려 사유 (reviewer가 grep으로 확인):

| ❌ Anti-pattern | ✅ 대체 |
|----------------|--------|
| `<div className="mx-auto max-w-Nxl px-N py-N">` | `<PageShell title>` |
| `<main className="...">` (nested) | `<>{children}</>` 또는 `<PageShell>` |
| `<h1 className="text-2xl">...</h1>` 직접 렌더 | PageShell `title` prop |
| `style={{ padding | maxWidth | margin }}` 인라인 | (제거. AppShellMain만) |
| `h-[calc(100vh-XX)]` 해킹 | `PageShellFit` (자동 viewport-fit) |
| layout.tsx에 padding 추가 | 가드만, fragment 패스 |
| `border-input bg-background h-10 px-3 py-2 text-sm` (옛 shadcn) | `h-8 border-(--border-default) bg-(--bg-page) px-2 text-[13px]` |
| `bg-blue-500 text-red-600 border-slate-300` (raw 색상) | `bg-(--brand-primary) text-(--fg-primary) border-(--border-default)` |
| `<h1 className="text-2xl font-bold">제목</h1>` 한국어 하드코딩 | `t("title")` (next-intl) |
| 카드형 그리드 (행을 카드로) | DataGrid baseline |
| 모달 폼 (신규 행 입력 다이얼로그) | DataGrid 인라인 편집 |
| 무한 스크롤 / virtualized rows | 서버 페이징 (default `limit=50`) |
| `@tanstack/react-table` 신규 도입 | DataGrid baseline (`apps/web/components/grid/DataGrid.tsx`) |

---

## 10. 자동 audit 회귀 차단

신규 page/layout 추가 시 reviewer가 다음 grep으로 검증:

```bash
# 페이지 root wrapper 위반 (0건이어야 함):
rg -n 'mx-auto|max-w-\[|max-w-[0-9]|\bp-[0-9]|\bpx-[0-9]|\bpy-[0-9]|\bpt-[0-9]|\bpb-[0-9]|h-\[calc\(100vh|<main\b' \
   apps/web/app/\(app\)/ --glob '*.tsx' --glob '!**/_components/**' --glob '!ask/**'

# 옛 shadcn 기본 토큰 잔재 (page 또는 _components):
rg -n 'border-input|bg-background.*px-3 py-2 text-sm|text-foreground' \
   apps/web/app/\(app\)/ --glob '*.tsx' --glob '!ask/**'

# raw Tailwind 색상 (페이지 레벨에서):
rg -n '\bbg-(blue|red|green|amber|rose|slate|gray|zinc)-[0-9]|\btext-(blue|red|green|amber|rose|slate|gray|zinc)-[0-9]' \
   apps/web/app/\(app\)/ --glob '*.tsx' --glob '!**/_components/**'

# layout.tsx <main> nested:
rg -n '<main\b' apps/web/app/\(app\)/ --glob 'layout.tsx'
```

`_components/` 하위 내부 컴포넌트(form 카드·셀 등)는 자체 padding/색상 정상 — 제외.

ask/* 라우트는 fullWidth bypass (AppShellMain 자체가 wrapper 안 씌움) — 제외.

---

## 11. 신규 화면 PR 체크리스트

신규 화면 또는 화면 수정 PR 머지 전 모두 통과해야 함. spec-reviewer가 검증:

### 공통 (모든 화면)
- [ ] `<PageShell>` 또는 `<PageShellFit>` 사용 (직접 wrapper 0건)
- [ ] PageHeader는 `title`/`actions` prop으로만 (자체 `<h1>`/`<header>` 0건)
- [ ] layout.tsx에 padding/`<main>`/wrapper 추가 안 함 (가드만, fragment 패스)
- [ ] `mx-auto` / `max-w-*` / `px-N` / `py-N` / `style padding` / `calc(100vh-...)` 직접 사용 0건
- [ ] 모든 라벨 i18n 키 (하드코딩 한국어 0건)
- [ ] 색상은 CSS 변수만 (raw Tailwind 색상 0건)
- [ ] type-check 0 errors / lint 0 new warnings
- [ ] 자동 audit grep (§10) 모두 0 hits

### 입력/필터 form
- [ ] `<select>`/`<input>` 표준 토큰 사용 (`h-8` + `border-(--border-default)` + `bg-(--bg-page)` + `text-[13px]`)
- [ ] 옛 shadcn 토큰 (`border-input bg-background h-10 px-3 py-2 text-sm`) 0건
- [ ] 라벨은 `<GridFilterField>` 또는 표준 토큰 (`text-[12px] font-medium text-(--fg-primary)`)

### 그리드 페이지 (추가)
- [ ] `<PageShellFit>` 사용 (PageShell 아님)
- [ ] [grid-standard.md](./grid-standard.md) 11항 체크리스트 모두 통과
- [ ] DataGrid baseline 사용 (`@tanstack/react-table` 신규 도입 0건)
- [ ] GridContainer 최상단 wrapper = `<div className="flex h-full min-h-0 flex-col gap-3">`

### 본문/폼 페이지 (추가)
- [ ] `<PageShell>` 사용 (PageShellFit 아님)
- [ ] 본문 max-w 추가 안 함 (AppShellMain max-w만 사용)
- [ ] prose 본문: `prose max-w-none` (자체 max-w 금지)

---

## 12. 마이그레이션 가이드 (옛 화면 → 표준)

기존 화면을 표준으로 이관할 때 단계:

### Step 1 — wrapper 식별
```tsx
// 옛 패턴 (예시)
return (
  <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
    <PageHeader title="제목" />
    <Content />
  </div>
);
```

### Step 2 — 화면 종류 결정 (§2 결정 트리)
- 그리드/실시간? → PageShellFit
- 본문/폼? → PageShell

### Step 3 — 변환
```tsx
return (
  <PageShell title="제목">
    <Content />
  </PageShell>
);
```

### Step 4 — import 정리
- `PageHeader` import 제거 (PageShell이 내부적으로 사용)
- 사용 안 하는 wrapper 클래스 정리

### Step 5 — 검증
- `pnpm --filter @jarvis/web type-check`
- audit grep (§10) 해당 파일 0 hits
- 시각 비교: 메뉴 화면(admin/menus)과 좌우/위/아래 여백 동일 여부

---

## 13. 참고

- **AppShellMain**: [apps/web/components/layout/AppShellMain.tsx](../../../../apps/web/components/layout/AppShellMain.tsx) — 외곽 여백 SoT
- **PageShell / PageShellFit**: [apps/web/components/patterns/PageShell.tsx](../../../../apps/web/components/patterns/PageShell.tsx)
- **PageHeader**: [apps/web/components/patterns/PageHeader.tsx](../../../../apps/web/components/patterns/PageHeader.tsx)
- **GridSearchForm / GridFilterField**: [apps/web/components/grid/GridSearchForm.tsx](../../../../apps/web/components/grid/GridSearchForm.tsx), [GridFilterField.tsx](../../../../apps/web/components/grid/GridFilterField.tsx)
- **그리드 상세 표준**: [grid-standard.md](./grid-standard.md)
- **i18n 규칙**: [`jarvis-i18n` 스킬](../../jarvis-i18n/SKILL.md)
- **DB / 권한 규칙**: [`jarvis-db-patterns` 스킬](../../jarvis-db-patterns/SKILL.md)

---

## 14. 변경 이력

| 날짜 | 변경 | 사유 |
|------|-----|------|
| 2026-05-16 | 신설 | 33+ 화면 PageShell/PageShellFit 일괄 통일 후 표준 명문화. 신규 화면은 이 가이드만 보고 만들 수 있도록 actionable skeleton + audit grep 포함. |
