# Jarvis · ISU Design System — 진행 가이드 v2

> **이 문서의 목적**
> Claude Code가 이어받아 ① 남은 shadcn 프리미티브 리튠, ② 신규 화면 추가, ③ 기존 페이지의 부분 리디자인을 **일관된 시스템**으로 처리할 수 있게 하는 작업 매뉴얼.
> 이미 리튠 완료된 참조 구현:
> - `components/project/TaskTable.tsx`
> - `components/project/StaffTable.tsx`
> - `components/project/InquiryTable.tsx`
> - `components/project/ProjectForm.tsx`
> - `components/project/ProjectTable.tsx`
> - `components/project/ProjectTabs.tsx`
>
> **새 화면을 만들 때 이 파일들을 먼저 읽고 패턴을 모방하세요.** 특히 TaskTable은 폼+테이블+칩+빈상태를 한 파일에 모두 담고 있어 가장 좋은 레퍼런스입니다.

---

## 0. 디자인 원칙 (한 줄 요약)

> **업무용 엔터프라이즈 툴. 밀도 높게, 차분한 브랜드 블루(ISU Blue) + 라임 악센트. 장식 최소화, 정보 최대화.**

- 큰 radius 금지 (`rounded-md` = 6px 기본, 폼/테이블 카드)
- 얇은 그림자 (`shadow-[0_1px_2px_rgba(15,23,42,0.03)]`)
- uppercase tracking-wide 레이블로 "시스템" 느낌
- 숫자·ID·날짜는 전부 `tabular-nums` + `text-display` 또는 mono
- 호버에만 액션 노출 (테이블 행의 삭제 버튼 등)

---

## 1. 컬러 시스템

### 1-1. 토큰 (이미 `app/globals.css`에 등록됨)

사용 시 **항상 토큰/유틸 클래스만 사용**. 새 hex/oklch 값을 인라인으로 넣지 마세요.

| 카테고리 | 스케일 | 주 용도 |
|---|---|---|
| **ISU Blue** | `isu-50` → `isu-950` | 프라이머리 브랜드 / 포커스 / 액션 / 호버 배경 |
| **ISU Lime** | `lime-50` → `lime-700` | 악센트 / CTA 강조 / 지식 그래프 |
| **Surface (brand-tinted neutral)** | `surface-50` → `surface-950` | 배경·보더·본문·보조 텍스트 |
| **Semantic** | `success`, `warning`, `danger`, `info` + `-subtle`, `-strong` | 상태/알림 |

### 1-2. 칩 & 상태 색상 팔레트 (표준)

테이블/카드에서 상태·우선순위·카테고리 칩은 **반드시** 이 매핑을 사용하세요. 다른 색을 발명 금지.

```ts
// 상태 (Status)
"neutral / default"  → bg-surface-100 text-surface-700 ring-surface-300     dot: bg-surface-400
"primary / active"   → bg-isu-50      text-isu-700     ring-isu-500/20     dot: bg-isu-500
"violet / in-review" → bg-violet-50   text-violet-700  ring-violet-500/20  dot: bg-violet-500
"success / done"     → bg-emerald-50  text-emerald-700 ring-emerald-600/20 dot: bg-emerald-500
"warning / on-hold"  → bg-amber-50    text-amber-800   ring-amber-600/25   dot: bg-amber-500
"danger / urgent"    → bg-red-50      text-red-700     ring-red-600/25     dot: bg-red-500
```

**칩 구현 패턴 (이미 InquiryTable, TaskTable, ProjectTable에 동일):**

```tsx
function StatusChip({ value }: { value: string }) {
  const meta = STATUS_STYLES[value] ?? STATUS_STYLES.todo;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
      meta.chip,
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

// Priority는 dot 없이, uppercase tracking-wide 10.5px
function PriorityChip({ value }: { value: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
      meta.chip,
    )}>
      {meta.label}
    </span>
  );
}
```

---

## 2. 타이포그래피

### 2-1. 폰트 스택

- `font-display` (Pretendard Variable 계열) — UI 레이블·헤딩·숫자
- `font-sans` (본문) — 긴 텍스트, description
- `font-mono` (JetBrains Mono) — 코드·ID(employeeId)·날짜 보조

### 2-2. 스케일 — 엔터프라이즈 밀도

**이 프로젝트는 일반 웹사이트가 아니라 업무툴이라 글자 크기가 의도적으로 작습니다.** 대시보드/데스크톱 기준:

| 용도 | 크기 | 클래스 |
|---|---|---|
| 카드 섹션 타이틀 | 13px / 600 | `text-[13px] font-semibold text-surface-900` |
| 카드 서브타이틀 | 11px | `text-[11px] text-surface-500` |
| 폼 레이블 (uppercase 시스템 느낌) | 10px / 600 / tracking-[0.12em] | `text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500` |
| 테이블 헤더 | 11px / 600 / uppercase tracking-[0.1em] | `text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500` |
| 테이블 셀 (기본) | 13.5px / 500 | `text-[13.5px] font-medium text-surface-900` |
| 테이블 셀 (보조/메타) | 11~12px | `text-[12px] text-surface-500` or `text-[11.5px]` |
| 인풋 텍스트 | 13px | `text-[13px]` |
| 칩 | 10.5~11px | 위 칩 패턴 참고 |
| 빈 상태 메인 | 13px / 500 | `text-[13px] font-medium text-surface-700` |
| 빈 상태 서브 | 11px | `text-[11px] text-surface-400` |
| 마이크로 메타 (ID 등) | 11px mono | `text-display font-mono text-[11px]` |

- **숫자가 들어간 셀에는 거의 항상 `tabular-nums`** 붙이기.
- **uppercase 레이블은 `text-display` 유틸과 같이 쓰기** (letter-spacing -0.02em + display 폰트).

---

## 3. 레이아웃 · 간격 · 반경

| 토큰 | 값 | 용도 |
|---|---|---|
| `rounded-md` | 6px | **폼 카드, 테이블 카드, 인풋 기본** |
| `rounded-[5px]` | 5px | 아이콘 배지 |
| `rounded-full` | 칩, 아바타 원, status dot |
| `rounded-lg` / `rounded-xl` | — | **사용 자제**. 이미 큰 radius는 "브랜드 너무 부드러워" 느낌. 꼭 필요한 모달/시트에만 |

**패딩 스탠다드:**
- 카드 헤더: `px-5 py-3`
- 카드 바디: `p-5`
- 카드 푸터: `px-5 py-3`
- 테이블 셀 기본: `py-3`
- 필드 간격: `gap-4` (`md:grid-cols-2`)

**보더:**
- 카드 외곽: `border border-surface-200`
- 카드 내부 구분선: `border-b border-surface-200` (헤더 하단) / `border-t border-surface-100` (푸터 상단)
- 테이블 행: `border-surface-100`

**그림자:**
- 카드 기본: `shadow-[0_1px_2px_rgba(15,23,42,0.03)]`
- 그 이상 필요하면 토큰 `shadow-elev-2` / `shadow-elev-3` 사용

---

## 4. 표준 컴포넌트 패턴

### 4-1. 폼 카드 (Form Card)

**가장 중요한 패턴.** TaskTable, StaffTable, InquiryTable, ProjectForm 모두 동일한 4-파트 구조.

```tsx
<form className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
  {/* ① 헤더 — 아이콘 배지 + 타이틀 + 서브타이틀 */}
  <div className="flex items-center gap-2 border-b border-surface-200 bg-surface-50/60 px-5 py-3">
    <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
      <Plus className="h-3.5 w-3.5" />
    </span>
    <div>
      <h2 className="text-[13px] font-semibold text-surface-900">새 태스크 추가</h2>
      <p className="text-[11px] text-surface-500">이 프로젝트에 할 일을 기록합니다.</p>
    </div>
  </div>

  {/* ② 에러 스트립 (옵션, 서버 에러 시) */}
  {serverError && (
    <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-[12.5px] text-red-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{serverError}</span>
    </div>
  )}

  {/* ③ 바디 — 필드 그리드 */}
  <div className="grid gap-4 p-5 md:grid-cols-2">
    <Field label="Title" span={2}>
      <Input ... />
    </Field>
    {/* ... */}
  </div>

  {/* ④ 푸터 — 힌트/에러(좌) + 액션(우) */}
  <div className="flex items-center justify-between gap-3 border-t border-surface-100 bg-surface-50/40 px-5 py-3">
    {error ? (
      <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600">
        <AlertCircle className="h-3.5 w-3.5" />
        {error}
      </p>
    ) : (
      <p className="text-display text-[11px] text-surface-400">필수 항목: 제목</p>
    )}
    <Button type="submit" size="sm" disabled={isPending}>
      <Plus className="h-3.5 w-3.5" />
      {isPending ? "저장 중…" : "추가"}
    </Button>
  </div>
</form>
```

**헬퍼(모든 폼 파일에 동일하게 복붙):**

```tsx
function Field({ label, span, error, children }: {
  label: string; span?: 2; error?: string; children: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1.5", span === 2 && "md:col-span-2")}>
      <span className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </span>
      {children}
      {error && (
        <span className="text-display block text-[11px] font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

function Select({ value, onChange, options, compact }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; compact?: boolean;
}) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex w-full appearance-none rounded-md border border-surface-200 bg-white px-3 pr-8 text-surface-900 shadow-[0_1px_2px_rgba(15,23,42,0.02)] focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-200",
          compact ? "h-8 min-w-[130px] text-[12px]" : "h-9 text-[13px]",
        )}
        value={value} onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-surface-400"
           viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
```

> **왜 shadcn `<Select>`를 안 쓰나?** 이 네이티브 래퍼가 훨씬 밀도 높고 9px 높이로 맞출 수 있어서 엔터프라이즈 느낌이 더 강합니다. shadcn Select는 Popover가 필요한 복잡한 경우에만.

### 4-2. 테이블 카드 (Table Card)

```tsx
<div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
  <Table>
    <TableHeader className="bg-surface-50/70">
      <TableRow className="border-surface-200 hover:bg-transparent">
        <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
          Title
        </TableHead>
        {/* … */}
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.length === 0 ? <EmptyRow /> : items.map(item => (
        <TableRow key={item.id} className="group border-surface-100 hover:bg-isu-50/40">
          <TableCell className="py-3">…</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

**필수 규칙:**
- 헤더 배경: `bg-surface-50/70`
- 헤더 셀: `text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500`
- 행 호버: `hover:bg-isu-50/40` (부드러운 블루 웨시)
- 행 액션(삭제/편집)은 **`group` + 호버 시에만 `opacity-100`** 로 노출

### 4-3. 빈 상태 (Empty State)

```tsx
<TableRow>
  <TableCell colSpan={N} className="py-14 text-center">
    <div className="flex flex-col items-center gap-2 text-surface-500">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-50 text-surface-400 ring-1 ring-surface-200">
        <ListChecks className="h-4 w-4" />
      </span>
      <p className="text-[13px] font-medium text-surface-700">아직 태스크가 없습니다.</p>
      <p className="text-[11px] text-surface-400">위 폼으로 첫 할 일을 기록해 보세요.</p>
    </div>
  </TableCell>
</TableRow>
```

### 4-4. 아바타 (Inline User)

테이블 셀의 사용자 표시는 통일:

```tsx
// 이름 + 사원번호(mono) 조합 — StaffTable/InquiryTable/TaskTable 모두 동일
<span className="inline-flex items-center gap-1.5 text-[12.5px] text-surface-700">
  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-isu-50 text-[10px] font-semibold text-isu-700 ring-1 ring-inset ring-isu-200">
    {name.slice(0, 1)}
  </span>
  <span className="truncate">
    {name}
    <span className="text-display ml-1 text-[11px] text-surface-400">{employeeId}</span>
  </span>
</span>
```

스태프 리스트처럼 큰 행이면 `h-8 w-8` 아바타 + 12px 이름.

### 4-5. 날짜 표시

```tsx
function formatDate(value: string | null) {
  if (!value) return <span className="text-surface-300">—</span>;
  return (
    <span className="text-display inline-flex items-center gap-1 tabular-nums text-surface-700">
      <Calendar className="h-3 w-3 text-surface-400" />
      {value}
    </span>
  );
}
```

- null/빈 값은 항상 `—` (em dash) + `text-surface-300`.
- 기간 표현: `{start} → {end}` (`text-surface-300` 화살표).

### 4-6. 페이지 네비게이션 (Tabs)

`ProjectTabs` 참조. bottom border 기반 탭, active는 `border-isu-500 text-isu-700`, 아이콘 색도 동기화.

---

## 5. 버튼 사용 규칙

`components/ui/button.tsx`가 표준. 다음 규칙 준수:

| 시나리오 | variant | size | 아이콘 |
|---|---|---|---|
| 주요 CTA (폼 제출) | `default` | `sm` (엔터프라이즈 기본) | 왼쪽 `h-3.5 w-3.5` |
| 보조/취소 | `ghost` or `outline` | `sm` | 옵션 |
| 위험(삭제) | `ghost` + `text-red-600 hover:bg-red-50` | `sm` | `<X className="h-3.5 w-3.5" />` |
| 테이블 행 액션 | `ghost` + `h-7 gap-1 px-2 text-[11.5px]` + opacity on hover | — | `h-3 w-3` |
| 강조 CTA (라임) | `accent` | `default` or `lg` | — |

> **size="default"는 일반 웹사이트에선 맞지만 이 툴에선 크게 느껴집니다. 기본적으로 `sm` 쓰고, 정말 강조할 때만 `default`.**

아이콘 크기 스케일: 3 (12px) < 3.5 (14px) < 4 (16px). 버튼 안 아이콘은 보통 `h-3.5 w-3.5`.

---

## 6. 모션

- 모든 호버 전환: `transition-colors` 또는 `transition-all` (그룹 페이드인 시)
- 스켈레톤 로딩: `.shimmer` 유틸 사용
- 로딩 중 아이콘: `<Sparkles className="h-3.5 w-3.5 animate-pulse" />` (TaskTable 참조)
- 긴 작업 (Ask AI, Search): `GlobeLoader` 재사용
- `prefers-reduced-motion: reduce` 자동 비활성화됨 (globals.css에서 처리)

---

## 7. 아이콘 가이드

**라이브러리:** `lucide-react` 전용. 다른 아이콘 팩 금지.

**도메인별 표준 아이콘:**
| 개념 | 아이콘 |
|---|---|
| 추가 | `Plus` / 폼 타입에 따라 `UserPlus`, `FolderPlus`, `MessageSquarePlus` |
| 저장 | `Save` |
| 취소·닫기 | `X` |
| 편집 | `Pencil` |
| 삭제 | `Trash2` or `X` (행 내부) |
| 에러 | `AlertCircle` |
| 성공 | `CheckCircle2` |
| 경고 | `AlertTriangle` |
| 사용자 | `User` (단수) / `Users` (다수) |
| 프로젝트 | `FolderKanban` |
| 태스크 | `ListChecks` |
| 문의 | `MessagesSquare` / `MessageSquarePlus` |
| 날짜 | `Calendar` |
| 이동·외부 | `ArrowUpRight` |
| 정렬 | `ChevronUp` / `ChevronDown` / `ChevronsUpDown` |
| 로딩·AI | `Sparkles` + `animate-pulse` |

**크기:** 기본 `h-3.5 w-3.5`. 카드 헤더 배지 안 = `h-3.5`. 빈 상태 배지 = `h-4`. 본문에 인라인 = `h-3`.

---

## 8. 다국어 (`next-intl`)

모든 리튠 컴포넌트는 `useTranslations("<namespace>")` 사용 중. 새 화면도 메시지 키를 `messages/ko.json`, `messages/en.json`에 먼저 추가하고 불러쓰기.

네임스페이스 컨벤션:
- `Projects.TaskTable.*`, `Projects.StaffTable.*`, `Projects.InquiryTable.*`
- 신규 화면도 `<Domain>.<Component>.<key>` 규칙.

---

## 9. 남은 작업 체크리스트 (Claude Code 핸드오프)

### 9-1. shadcn 프리미티브 리튠 (`components/ui/*`)

이미 `button.tsx`, `badge.tsx`는 리튠됨. 남은 것들:

| 파일 | 해야 할 일 |
|---|---|
| `input.tsx` | 기본 height `h-10` → `h-9`, `text-sm` → `text-[13px]`, `rounded-md` 유지, placeholder 색상 `text-surface-400`. 포커스 ring `ring-isu-200` + border `isu-500`로 변경 |
| `textarea.tsx` | 위 input과 동일한 컬러/포커스, 최소 높이 `min-h-[80px]` 유지 |
| `select.tsx` | 우리 네이티브 `<Select>` 헬퍼와 컬러 맞추기. trigger height `h-9`, `text-[13px]` |
| `table.tsx` | 이미 호환됨. `TableHead` 기본 색만 `text-surface-500`로 확인 |
| `tabs.tsx` | `ProjectTabs`와 같은 bottom-border 스타일로 추상화 |
| `dialog.tsx` / `sheet.tsx` | 여기만 예외적으로 `rounded-lg` 허용. 헤더 `px-5 py-3` + `border-b border-surface-200`, 바디 `p-5`로 맞추기 |
| `dropdown-menu.tsx` | trigger hover `bg-surface-100`, item `text-[13px]`, separator `bg-surface-200` |
| `card.tsx` | 기본 `rounded-md`, `border-surface-200`, `shadow-[0_1px_2px_rgba(15,23,42,0.03)]`로 변경. CardHeader 패딩 `px-5 py-3` |
| `checkbox.tsx` / `radio-group.tsx` / `switch.tsx` | checked 상태 `bg-isu-500`, focus ring `ring-isu-200` |
| `tooltip.tsx` | `bg-surface-900 text-surface-50 text-[11px]` |
| `toast.tsx` | 에러 variant는 `bg-red-50 border-red-200 text-red-700`, success는 emerald |

### 9-2. 화면 리디자인 (우선순위 순)

1. **Dashboard** (`app/[locale]/(app)/dashboard/*`) — KPI 타일 (`components/patterns/KpiTile.tsx`) 4종 + 스파크라인. 폼 카드 패턴을 "대시보드 카드"로 재사용.
2. **Ask AI** (`components/ai/*`) — 기존 Claude Desktop 감성 유지. `AskSidebar`는 이 시스템의 "사이드 리스트" 패턴으로 정돈: 날짜 그룹핑 + hover `bg-isu-50/40`.
3. **Search** (`components/search/*`) — `ResultCard` 폼 카드 스타일, `FacetBadge`를 Priority/Status 칩과 같은 ring 시스템으로.
4. **Wiki** (`components/WikiPageView/*`, `components/WikiEditor/*`) — `InfraRunbookHeader`는 카드 헤더 패턴 확장판. 본문은 그대로 두고 chrome만 정돈.
5. **Knowledge Base** (`components/knowledge/*`) — 카테고리 카드 그리드. `PageViewer`/`PageEditor`는 WikiPageView와 같은 헤더-바디 구조.
6. **Systems** (`components/system/*`) — `SystemCard` → 헬스 상태 테이블 + 칩. `AccessPanel`은 StaffTable과 같은 폼+테이블 구조.
7. **Attendance** (`components/attendance/*`) — `AttendanceCalendar`는 그대로. `CheckInButton` large/accent variant. `AttendanceTable`은 표준 테이블 카드로.
8. **Admin** (`components/admin/*`) — `UserForm`, `UserTable`, `MenuEditor`, `AuditTable`, `SettingsForm`, `CodeTable`, `OrgTree`, `SearchAnalyticsDashboard` 전부 동일 시스템.
9. **Notices / Infra / Architecture / Login / Profile** — 로그인은 지침에 있던 좌측 브랜드 + GlobeLoader 유지.

### 9-3. 리튠 작업 표준 절차 (각 파일별)

1. 파일 읽기 → 현재 구조 파악
2. 레이아웃 스켈레톤 교체:
   - `rounded-2xl` → `rounded-md`
   - `border-surface-200 bg-card p-5 shadow-sm` → `border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]`
   - 폼은 **헤더-에러-바디-푸터** 4파트로 쪼갬
3. 타이포 치환:
   - `text-lg font-semibold` (카드 타이틀) → `text-[13px] font-semibold`
   - `text-sm text-surface-500` → `text-[11px] text-surface-500`
   - `text-sm font-medium` (필드 레이블) → `text-display text-[10px] font-semibold uppercase tracking-[0.12em]`
4. `<select>` 직접 스타일링 → `<Select>` 헬퍼로
5. `<label>` 직접 스타일링 → `<Field>` 헬퍼로
6. `Badge variant="warning"` → `<StatusChip>` / `<PriorityChip>` 헬퍼로 (색 팔레트 §1-2)
7. 에러 메시지 `text-rose-600` → `text-red-600 + <AlertCircle>`
8. 빈 상태는 §4-3 패턴
9. 아이콘 추가 (§7 표 참조)
10. 액션 버튼 `size="default"` → `size="sm"` + 아이콘
11. 호버 상호작용 — 행 삭제 버튼은 `group-hover:opacity-100`

### 9-4. 금지 사항 (하지 마세요)

- ❌ 인라인 hex/rgb 컬러 (`#2b5bff`, `rgb(...)`) — 토큰만
- ❌ 그라데이션 배경 (AI slop)
- ❌ `rounded-2xl` / `rounded-3xl` — 폼·테이블·칩에서 금지
- ❌ 이모지 (브랜드 아니면)
- ❌ `text-base` (16px) 이상을 UI 레이블에 — 밀도 파괴
- ❌ `shadow-lg` 이상 — 너무 떠 보임
- ❌ `bg-card` (구 토큰) — `bg-white` 사용
- ❌ `text-rose-*` — `text-red-*` 통일
- ❌ `border-surface-300`을 카드 보더로 — 너무 진함. 카드는 `border-surface-200`

---

## 10. 신규 화면 만들 때 체크리스트

- [ ] 페이지 루트: `space-y-6` + `mx-auto max-w-7xl px-6 py-8` (표준) 또는 AppShell에 맞춘 컨테이너
- [ ] 페이지 상단: `<PageHeader>` (이미 있음) — 타이틀 + 메타 + 액션
- [ ] 필터/검색: 테이블 카드 위에 얇은 툴바 (`flex items-center gap-2 px-5 py-3 border-b border-surface-100 bg-surface-50/40`)
- [ ] 데이터 없음 → 빈 상태 (§4-3)
- [ ] 로딩 → `.shimmer` 스켈레톤
- [ ] 에러 → 에러 스트립 (§4-1 ②)
- [ ] 모든 서버 액션 `useTransition` + `isPending` 버튼 라벨 교체
- [ ] 숫자 `tabular-nums`
- [ ] ID/사번 mono
- [ ] 다국어 키 `messages/*.json` 추가

---

## 11. 빠른 참조 — 클래스 카피북

**폼 카드 래퍼:**
```
overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]
```

**카드 헤더:**
```
flex items-center gap-2 border-b border-surface-200 bg-surface-50/60 px-5 py-3
```

**카드 푸터:**
```
flex items-center justify-between gap-3 border-t border-surface-100 bg-surface-50/40 px-5 py-3
```

**아이콘 배지 (카드 헤더용):**
```
flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200
```

**필드 레이블:**
```
text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500
```

**테이블 헤더 셀:**
```
text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500
```

**테이블 행 호버:**
```
group border-surface-100 hover:bg-isu-50/40
```

**네이티브 select 인풋:**
```
flex h-9 w-full appearance-none rounded-md border border-surface-200 bg-white px-3 pr-8 text-[13px] text-surface-900 shadow-[0_1px_2px_rgba(15,23,42,0.02)] focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-200
```

**에러 인라인 메시지:**
```
inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600
```

**에러 스트립:**
```
flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-[12.5px] text-red-700
```

---

## 12. 확장 포인트 (나중)

- 다크 모드: `globals.css`에 이미 surface 스케일이 있으므로 `:root[data-theme="dark"]` 블록에 셀렉트 토큰 오버라이드만 추가하면 됨. 카드 배경은 `surface-950`, 보더 `surface-800`.
- Storybook: 이미 `*.stories.tsx` 파일들이 일부 있음. 신규 패턴 (Field, Select, StatusChip)도 `components/patterns/`에 추출 후 스토리 추가 추천.
- 테스트: 칩 라벨/색 매핑은 `STATUS_STYLES`/`PRIORITY_STYLES` 객체를 export 해서 snapshot 공유하는 게 좋음.

---

## 부록 A — 리튠 완료 컴포넌트 요약

| 파일 | 핵심 패턴 |
|---|---|
| `components/project/TaskTable.tsx` | 4-파트 폼 카드 + 테이블 + StatusChip + PriorityChip + EmptyRow + Field/Select 헬퍼 |
| `components/project/StaffTable.tsx` | 폼 카드 + 테이블 + 아바타(8×8) + 행 hover-reveal 삭제 버튼 |
| `components/project/InquiryTable.tsx` | 폼 카드 + StatusChip in-row + 셀렉트 dirty-state (Save 버튼 조건부 활성) |
| `components/project/ProjectForm.tsx` | create/edit 양모드 폼 카드 + dirty-state 힌트 |
| `components/project/ProjectTable.tsx` | @tanstack/react-table + StatusChip + 정렬 아이콘 세트 + 페이지네이션 |
| `components/project/ProjectTabs.tsx` | bottom-border 탭 (active = `border-isu-500`) |

이 6개 파일을 **원본 레퍼런스**로 삼아 모든 남은 화면을 같은 패턴으로 밀어붙이면 됩니다.
