# Dashboard Redesign + Lounge Chat + Contractors 정리 — Design Spec

- **Date**: 2026-04-23
- **Owner**: minseok kim
- **Status**: Draft (awaiting user review)
- **Scope**: `apps/web/app/(app)/dashboard/**`, `apps/web/app/(app)/contractors/**`, `packages/db/schema/chat.ts` (신규), `apps/web/app/api/{chat,weather,fx}/**`, `apps/web/messages/ko.json`

## 1. 목적

Jarvis 대시보드를 "위젯 5종(점검필요 위키·24h 활동·인기검색·최근활동·빠른질문)" 구조에서 **사내 포털 허브** 구조로 전환한다. 핵심 가치:

1. **하루의 시작점** — 인사말, 날짜/시간/날씨/환율 Hero 4카드
2. **실시간 라운지** — 전사 채팅 + 이모지 리액션
3. **사내 정보 허브** — 사내 공지 · 금주 휴가 · 최신 위키 3 위젯
4. **외주인력 흐름 정상화** — 탭 순서·명칭 변경, 자동 목록, Master-Detail 휴가관리

## 2. 범위

**포함**
- 대시보드 페이지 완전 재작성 (기존 위젯 전부 제거)
- 신규 `chat` 도메인 (스키마·액션·SSE)
- 외부 날씨·환율 API **Mock 어댑터** (실 키 환경변수 자리만 확보)
- 외주인력관리 탭 리팩토링 (신규 계약 UI 제거·탭 순서 변경·휴가관리 Master-Detail)
- i18n 배치 재구성

**제외** (Out-of-scope)
- 다중 채팅 채널 / DM / 멘션 / 파일 첨부 / 채팅 검색·무한 스크롤
- 실 기상청·수출입은행 API 연동 (Mock만, 어댑터로 교체 용이)
- 외주 신규 계약 등록 UI
- 외주 휴가 승인 워크플로
- 위젯 개인화·이모지 확장

## 3. 사용자 시나리오

1. **출근 대시보드 열기** → Hero에서 오늘 날짜·시간·날씨·환율 즉시 확인 → 라운지에 "출근했습니다" 입력 → 🙏 리액션 받음 → 오늘의 공지·휴가자·신규 위키 스캔 후 작업 시작.
2. **점심 전 라운지 잡담** → 누군가 "staging DB 스키마 마이그레이션 완료" 입력 → 다른 탭에서 SSE로 즉시 수신 → 👍 리액션.
3. **금주 휴가 확인** → VacationsWidget `박나연 · 디자인 연차 4/23-4/25` 클릭 → `/contractors` 월 달력으로 이동 → 휴가관리 탭에서 상세 신청 기록 확인.

## 4. 아키텍처 개요

### 4.1 Dashboard 페이지 (Server Component)

```
apps/web/app/(app)/dashboard/page.tsx (RSC)
├─ requirePageSession()
├─ Promise.all([
│    listDashboardNotices(workspaceId, 5),
│    listWeekVacations(workspaceId, now),
│    listLatestWikiPages(workspaceId, allowedSensitivities, 10),
│    listRecentChatMessages(workspaceId, 50),
│  ])
├─ <HeroGreeting name={session.name} />              // static
├─ <InfoCardRow />                                   // client (SWR + 시계틱)
├─ <LoungeChat initial={...} workspaceId={...} />    // client (SSE)
└─ <RightRail>
     <NoticesWidget items={notices} />
     <VacationsWidget items={vacations} />
     <LatestWikiWidget items={recentWiki} />
   </RightRail>
```

레이아웃: `grid-template-columns: minmax(0,1fr) 360px`, gap `16px`, 패딩 유지. 모바일 대응은 이번 스프린트 밖 (기존 대시보드 기준).

### 4.2 외부 API 어댑터

```
apps/web/lib/adapters/external/
├─ weather/
│  ├─ types.ts         // WeatherSnapshot shape
│  ├─ index.ts         // adapter selection by env
│  ├─ mock.ts          // 서울 · 맑음 · 18°C / H22 L12 · 미세먼지 좋음
│  └─ kma.ts           // (stub) 실 구현 자리 — 이번 PR은 빈 파일 or 미포함
└─ fx/
   ├─ types.ts         // FxSnapshot shape ({ rates: [{code,value,delta,basis}], ... })
   ├─ index.ts
   ├─ mock.ts          // USD 1342, EUR 1458, JPY 892 (delta 고정)
   └─ exim.ts          // (stub)
```

- 라우트: `app/api/weather/route.ts`, `app/api/fx/route.ts` 둘 다 `export async function GET()` — 항상 200 반환 `{status: 'ok'|'error', data, source: 'mock'|'kma'|'exim', fetchedAt}`.
- 서버 캐시: 모듈 스코프 `Map<string, {data, expiresAt}>` — 날씨 10분 TTL, 환율 60분 TTL.
- `Cache-Control: s-maxage=600, stale-while-revalidate=60` (weather), `s-maxage=3600, stale-while-revalidate=300` (fx).
- 키 미설정 시 자동 Mock. 모두 fail-soft (대시보드 절대 막지 않음).

### 4.3 Lounge Chat 도메인

**스키마** (`packages/db/schema/chat.ts`)

```ts
export const chatMessage = pgTable("chat_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => user.id),
  body: text("body").notNull(),                      // max 2000 chars, 서버 액션에서 검증
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  wsCreatedIdx: index("idx_chat_msg_ws_created").on(t.workspaceId, t.createdAt.desc()),
}));

export const chatReaction = pgTable("chat_reaction", {
  messageId: uuid("message_id").notNull().references(() => chatMessage.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => user.id),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
  emojiCheck: check("chat_reaction_emoji_chk",
    sql`emoji IN ('👍','❤️','🎉','😂','🙏')`),
}));
```

`packages/shared/constants/chat.ts`:
```ts
export const CHAT_REACTION_EMOJIS = ['👍','❤️','🎉','😂','🙏'] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];
export const CHAT_MESSAGE_MAX_CHARS = 2000;
```

**서버 액션** (`apps/web/app/actions/chat.ts`)

```ts
"use server";
export async function sendMessage(body: string): Promise<{ id: string }>;
export async function deleteMessage(messageId: string): Promise<{ ok: true }>;
export async function toggleReaction(messageId: string, emoji: ChatReactionEmoji):
  Promise<{ action: 'added' | 'removed' }>;
```

- `requireSession()` (권한 상수 불필요 — 세션 도메인).
- 검증: Zod — body `.min(1).max(2000).trim()`, emoji 화이트리스트 in-memory enum.
- 각 액션 트랜잭션 종료 시 `pg_notify('chat_ws_' + workspaceId, JSON.stringify({kind, id, ...}))` — 페이로드는 **id+kind만** (8KB 제한 회피).
- `audit_log` 기록: `action='CHAT_SEND'|'CHAT_DELETE'|'CHAT_REACT_ADD'|'CHAT_REACT_REMOVE'`, `resource_type='chat_message'`.

**SSE 엔드포인트** (`apps/web/app/api/chat/stream/route.ts`)

- `GET` → `Response` (ReadableStream) · `Content-Type: text/event-stream`, `Cache-Control: no-store`.
- 전용 pg Pool (`lib/db/chat-listen-pool.ts`, max 200) — 애플리케이션 기본 풀 분리.
- 연결 시:
  1. `LISTEN chat_ws_{workspaceId}` 실행
  2. 15초마다 `:\n\n` heartbeat
  3. notification 수신 시 `SELECT` 로 최신 데이터 조회 → `event: message|reaction|delete\ndata: {...}` 전송
  4. `req.signal.aborted` 시 `UNLISTEN` + release
- 하나의 사용자 = 하나의 탭 = 하나의 연결. 다중 탭 지원.

**라우트 HTTP (REST 대신 server action 중심)**
- `POST /api/chat/send` — 선택적 non-streaming 폴백 (기본은 server action 호출).
- `POST /api/chat/reactions` — 동일.
- 실제 UI는 server action 직접 호출 + revalidate 없이 optimistic update.

**클라이언트** (`dashboard/_components/LoungeChat.tsx` + 하위)

```
LoungeChat (client, state holder)
├─ ChatHeader (title · online count · settings)
├─ ChatList
│   └─ ChatMessage (hover → ReactionPopover)
│       ├─ Avatar · Name · Dept · Timestamp
│       ├─ Body
│       └─ ReactionChipRow
└─ ChatComposer (Enter 전송 · Shift+Enter 줄바꿈 · 2000자 카운터)
```

- State: `messages: Message[]` (id dedupe), `pendingReactions: Set<string>` (낙관적).
- Online count: `useOnlineCount()` SWR 훅 — 30초 간격 `/api/chat/online` 호출 → `COUNT(DISTINCT user_id) FROM user_session WHERE updated_at > now() - interval '5 min' AND workspace_id = ...`.
- Reaction chip 본인 하이라이트: `isMineReacted(emoji) → bg-isu-50 border-isu-300`.

### 4.4 Right Rail 3 위젯

| Widget | Query | Limit | 빈 상태 |
|--------|-------|-------|--------|
| NoticesWidget | `notice` where published_at IS NOT NULL & (expires_at IS NULL OR > now) order by pinned DESC, published_at DESC | 5 | "게시된 공지가 없습니다." |
| VacationsWidget | `leave_request` join `user` where cancelled_at IS NULL & status='approved' & 주 오버랩 | 10 | "이번 주 휴가자가 없습니다." |
| LatestWikiWidget | `wiki_page_index` where published_status='published' & sensitivity filter order by created_at DESC | 10 | "최근 게시된 페이지가 없습니다." |

- 각 쿼리 파일: `apps/web/lib/queries/dashboard-{notices,vacations,wiki}.ts`
- **Sensitivity 필터는 쿼리 레벨 WHERE** (앱 레벨 필터 금지) — `getAllowedWikiSensitivityValues(userPermissions)` 재사용.
- 각 위젯은 독립 Card. 우측 상단 링크 (`/notices`, `/contractors`, `/wiki`).

### 4.5 Hero 영역

**Greeting**
- `apps/web/app/(app)/dashboard/_components/HeroGreeting.tsx` (server)
- 렌더: `<h1>안녕하세요, {session.name}님 <Capybara /></h1>`
- Capybara: `apps/web/public/mascot/capybara.svg` (단순 line-art, 32px).

**InfoCardRow** (client)
- `DateCard`: 서버 제공 `todayISO` + `Intl.DateTimeFormat('ko-KR', {year, month, day, weekday:'short'})`.
- `TimeCard`: 초 단위 setInterval, `useEffect` 마운트 후에만 시작, SSR 값은 `--:--:--` placeholder (하이드레이션 경고 방지).
- `WeatherCard`: `useSWR('/api/weather?region=seoul', fetcher, {refreshInterval: 600_000})`. 404/500 → fallback "데이터 없음".
- `FxCard`: `useSWR('/api/fx', fetcher, {refreshInterval: 3_600_000})`.

### 4.6 Contractors 리팩토링

**탭 재구성** (`apps/web/components/contractors/ContractorTabs.tsx`)

Before:
```
[인력] [일정]
```

After:
```
[일정] [휴가관리]
```

- 탭 순서: `일정` 기본. `휴가관리`가 두 번째.
- i18n: `Contractors.tabs.schedule`, `Contractors.tabs.leaves`.

**라우트 구조**

```
/contractors              → 일정 달력 (기존 schedule/page.tsx 내용 이동)
/contractors/schedule     → 동일 컴포넌트 리다이렉트 없이 동일 렌더 (북마크 보존)
/contractors/leaves       → 휴가관리 Master-Detail (신규)
```

**휴가관리 페이지** (`apps/web/app/(app)/contractors/leaves/page.tsx`)

```
LeaveManagementPanel (client)
├─ SearchBar
│   ├─ ReferenceDatePicker (default = 오늘)
│   ├─ NameFilter (text)
│   └─ SearchButton
├─ LeaveMasterTable
│   └─ rows: [No, 사번, 성명, 계약시작일, 계약종료일, 발행일수, 사용일수, 잔여일수, 비고]
│      클릭 → 선택 상태 업데이트
└─ LeaveDetailTable (selected contract)
    ├─ rows: [No, 삭제(checkbox), 상태, 근태명, 신청일, 신청상태, 적용시작/종료, 적용일수, 사유]
    │        dirty row 는 배경 하이라이트
    └─ Actions: [입력] [저장]
```

**Detail 테이블 동작 계약**

- `[입력]` 클릭 → 새 dirty 행 삽입. 기본값: `type='annual' · status='approved' · startDate=기준일자 · endDate=기준일자 · hours=8 · reason=''`. 편집 가능 셀: 근태명·적용시작·적용종료·적용일수·사유.
- 저장 전 검증: `startDate <= endDate`, `hours > 0`, `type ∈ {annual, halfAm, halfPm, sick, family}`. 실패 시 저장 차단 + 해당 행 경고 표시.
- 삭제 체크박스 → 다중 선택 후 `[저장]` 일괄 반영 (soft delete: `cancelled_at = now()`).
- `[저장]` → dirty inserts + cancels 를 **한 트랜잭션**으로 커밋. 성공 시 master 잔여일수 재계산(쿼리 refetch).
- 관리자 아닌 경우 `[입력]`·`[저장]` 버튼 비활성(본인 행도 변경 불가, Phase 1).

**쿼리**

```ts
// apps/web/lib/queries/contractors.ts (확장)
export async function listLeaveSummary(opts: {
  workspaceId: string;
  referenceDate: string; // yyyy-mm-dd
  nameLike?: string;
  currentUserId?: string; // non-admin 제한
}): Promise<LeaveSummaryRow[]>;
```

- contractor_contract.startDate ≤ refDate ≤ endDate 조건.
- 사용일수 = sum(leave_request.hours) where cancelled_at IS NULL & end_date ≤ refDate / 8.
- 잔여 = (generatedLeaveHours + additionalLeaveHours − 사용시간) / 8.
- 소수점 2자리 반올림.

**Batch 저장 액션**

```ts
// apps/web/app/(app)/contractors/leaves/actions.ts
"use server";
export async function saveLeaveBatch(input: {
  contractId: string;
  inserts: Array<{ type, startDate, endDate, hours, reason?, status? }>;
  cancels: string[]; // leaveRequestId[]
}): Promise<{ inserted: string[]; cancelled: string[] }>;
```

- `db.transaction(async tx => {...})` 원자.
- `CONTRACTOR_ADMIN` 필수. 본인 본인 취소는 별도(향후).
- Audit: 각 insert/cancel 건에 `audit_log` 레코드.

**제거 대상**
- `apps/web/components/contractors/NewContractorModal.tsx`
- `apps/web/components/contractors/ContractorTable.tsx` (roster view)
- `apps/web/components/contractors/ContractorDrawer.tsx` (상세 drawer, roster 종속)
- `apps/web/components/contractors/LeaveAddModal.tsx` (인라인 입력으로 대체)
- 신규 계약 생성 server action

### 4.7 디렉토리 구조 (신규 + 변경)

```
apps/web/
├─ app/
│  ├─ (app)/
│  │  ├─ dashboard/
│  │  │  ├─ page.tsx                                 [재작성]
│  │  │  └─ _components/
│  │  │     ├─ HeroGreeting.tsx                      [신규]
│  │  │     ├─ InfoCardRow.tsx                       [신규]
│  │  │     ├─ DateCard.tsx                          [신규]
│  │  │     ├─ TimeCard.tsx                          [신규]
│  │  │     ├─ WeatherCard.tsx                       [신규]
│  │  │     ├─ FxCard.tsx                            [신규]
│  │  │     ├─ LoungeChat.tsx                        [신규]
│  │  │     ├─ ChatMessage.tsx                       [신규]
│  │  │     ├─ ChatComposer.tsx                      [신규]
│  │  │     ├─ ReactionPopover.tsx                   [신규]
│  │  │     ├─ ReactionChipRow.tsx                   [신규]
│  │  │     ├─ NoticesWidget.tsx                     [신규]
│  │  │     ├─ VacationsWidget.tsx                   [신규]
│  │  │     └─ LatestWikiWidget.tsx                  [신규]
│  │  └─ contractors/
│  │     ├─ page.tsx                                 [일정 달력 렌더로 교체]
│  │     ├─ schedule/page.tsx                        [동일 컴포넌트 유지(북마크 보존)]
│  │     ├─ leaves/
│  │     │  ├─ page.tsx                              [신규]
│  │     │  └─ actions.ts                            [신규: saveLeaveBatch]
│  │     └─ layout.tsx                               [탭 순서/이름 변경]
│  ├─ actions/
│  │  └─ chat.ts                                     [신규]
│  └─ api/
│     ├─ chat/
│     │  ├─ stream/route.ts                          [신규: SSE]
│     │  ├─ send/route.ts                            [신규: POST fallback]
│     │  ├─ reactions/route.ts                       [신규]
│     │  └─ online/route.ts                          [신규]
│     ├─ weather/route.ts                            [신규]
│     └─ fx/route.ts                                 [신규]
├─ components/contractors/
│  ├─ ContractorTabs.tsx                             [탭 순서/이름 수정]
│  ├─ ScheduleCalendar.tsx                           [유지]
│  ├─ LeaveManagementPanel.tsx                       [신규]
│  ├─ LeaveMasterTable.tsx                           [신규]
│  ├─ LeaveDetailTable.tsx                           [신규]
│  ├─ NewContractorModal.tsx                         [삭제]
│  ├─ ContractorTable.tsx                            [삭제]
│  ├─ ContractorDrawer.tsx                           [삭제]
│  └─ LeaveAddModal.tsx                              [삭제]
├─ lib/
│  ├─ adapters/external/
│  │  ├─ weather/{types,index,mock}.ts               [신규]
│  │  └─ fx/{types,index,mock}.ts                    [신규]
│  ├─ db/chat-listen-pool.ts                         [신규]
│  └─ queries/
│     ├─ dashboard-notices.ts                        [신규]
│     ├─ dashboard-vacations.ts                      [신규]
│     ├─ dashboard-wiki.ts                           [신규]
│     ├─ chat.ts                                     [신규]
│     ├─ contractors.ts                              [listLeaveSummary 추가]
│     └─ dashboard.ts                                [미사용 export 정리]
├─ messages/ko.json                                  [배치 재구성]
└─ public/mascot/capybara.svg                        [신규]

packages/
├─ db/schema/
│  ├─ chat.ts                                        [신규]
│  └─ index.ts                                       [chat export 추가]
├─ db/drizzle/NNNN_create_chat.sql                   [신규 마이그레이션]
└─ shared/
   ├─ constants/chat.ts                              [신규: 이모지 화이트리스트]
   └─ validation/chat.ts                             [신규: Zod]
```

## 5. 데이터 모델 변경

### 5.1 신규 테이블

- `chat_message` (4.3 참조)
- `chat_reaction` (4.3 참조)

### 5.2 스키마 변경 없음

- `leave_request`, `contractor_contract`, `holiday`, `notice`, `wiki_page_index`, `user`, `workspace`, `user_session`

### 5.3 마이그레이션

- `pnpm db:generate` 결과 `packages/db/drizzle/NNNN_create_chat.sql` 생성
- 데이터 이행 없음
- `node scripts/check-schema-drift.mjs --precommit` 블로킹 게이트 통과 필수

## 6. 권한

### 6.1 기존 PERMISSIONS 재사용
- `CONTRACTOR_READ` — 휴가관리 조회 (본인만 or 전체)
- `CONTRACTOR_ADMIN` — 휴가관리 입력/저장/취소

### 6.2 신규 PERMISSIONS
- **없음**. Chat은 세션 도메인.

### 6.3 Sensitivity
- `notice.sensitivity` (PUBLIC/INTERNAL): 쿼리에서 WHERE 필터.
- `wiki_page_index.sensitivity`: 기존 `getAllowedWikiSensitivityValues` + `buildLegacyKnowledgeSensitivitySqlFilter` 재사용.
- `chat_message`: sensitivity 없음 (전사 공개).

## 7. i18n (ko.json 배치)

### 7.1 신규/변경 키 (요약)

```json
{
  "Dashboard": {
    "greeting": "안녕하세요, {name}님",
    "info": { "todayLabel": "오늘", "timeLabel": "현재 시각",
              "weatherLabel": "서울 · 맑음",
              "weatherHiLo": "H {hi}° / L {lo}°",
              "weatherParticulate": "미세먼지 {level}",
              "fxLabel": "환율 · KRW 기준",
              "source": { "weather": "기상청", "fx": "수출입은행" } },
    "lounge": { "title": "전사 라운지",
                "subtitle": "{online}명 온라인 · 자유 채팅",
                "composerPlaceholder": "{name} · {role} — 메시지 입력…",
                "send": "전송", "delete": "삭제",
                "deleted": "삭제된 메시지입니다",
                "addReaction": "리액션 추가",
                "empty": "아직 메시지가 없습니다. 첫 메시지를 남겨보세요." },
    "notices": { "title": "사내 공지", "viewAll": "전체",
                 "badgePinned": "필독", "badgeNotice": "공지", "badgeEvent": "이벤트",
                 "empty": "게시된 공지가 없습니다." },
    "vacations": { "title": "금주 휴가", "count": "{count}명",
                   "returnAt": "{date} ({weekday})",
                   "types": { "annual": "연차", "halfAm": "반차-오전",
                              "halfPm": "반차-오후", "sick": "질병",
                              "family": "경조사" },
                   "empty": "이번 주 휴가자가 없습니다." },
    "latestWiki": { "title": "최신 위키", "viewAll": "전체",
                    "empty": "최근 게시된 페이지가 없습니다." }
  },
  "Contractors": {
    "tabs": { "schedule": "일정", "leaves": "휴가관리" },
    "leaves": {
      "title": "휴가관리",
      "search": { "referenceDate": "기준일자", "name": "성명", "submit": "조회" },
      "master": {
        "columns": { "no": "No", "employeeId": "사번", "name": "성명",
                     "contractStart": "계약시작일", "contractEnd": "계약종료일",
                     "generated": "발행일수", "used": "사용일수",
                     "remaining": "잔여일수", "note": "비고" }
      },
      "detail": {
        "columns": { "no": "No", "delete": "삭제", "status": "상태",
                     "type": "근태명", "appliedAt": "신청일",
                     "requestStatus": "신청상태",
                     "startDate": "적용시작일", "endDate": "적용종료일",
                     "days": "적용일수", "reason": "사유" },
        "actions": { "add": "입력", "save": "저장" },
        "toast": { "saved": "저장되었습니다", "saveFailed": "저장 실패" }
      }
    }
  }
}
```

### 7.2 제거 키
- `Dashboard.MyTasks.*`, `Dashboard.QuickLinks.*`, `Dashboard.RecentActivity.*`, `Dashboard.StalePages.*`, `Dashboard.SearchTrends.*`
- `Dashboard.welcome`, `Dashboard.title`

### 7.3 보간 변수 일치
- `{name}, {count}, {hi}, {lo}, {level}, {online}, {date}, {weekday}, {role}` — 사용처와 양쪽 일치. `jarvis-i18n` 경계 검증 필수.

## 8. 외부 API 전략

### 8.1 어댑터 인터페이스

```ts
// apps/web/lib/adapters/external/weather/types.ts
export type WeatherSnapshot = {
  region: string;           // 'seoul'
  condition: string;        // '맑음' | '흐림' | ...
  tempC: number;
  hiC: number;
  loC: number;
  particulate: '좋음' | '보통' | '나쁨' | '매우나쁨';
  source: 'mock' | 'kma';
  fetchedAt: string;        // ISO
};

export interface WeatherAdapter {
  getSnapshot(region: string): Promise<WeatherSnapshot>;
}
```

```ts
// apps/web/lib/adapters/external/fx/types.ts
export type FxRate = {
  code: 'USD' | 'EUR' | 'JPY';
  value: number;            // KRW per 1 unit (JPY는 per 100)
  delta: number;            // % vs 전일 (+0.3 = +0.3%)
  basis: '1' | '100';
};

export type FxSnapshot = {
  rates: FxRate[];
  source: 'mock' | 'exim';
  fetchedAt: string;
};

export interface FxAdapter {
  getSnapshot(): Promise<FxSnapshot>;
}
```

### 8.2 Mock 구현

- `MockWeatherAdapter.getSnapshot()` → 서울 · 맑음 · 18°C / H 22° / L 12° · 미세먼지 좋음
- `MockFxAdapter.getSnapshot()` → USD 1342 (+0.3), EUR 1458 (−0.1), JPY 892 (+0.5, basis 100)

### 8.3 선택 로직

```ts
// weather/index.ts
export function getWeatherAdapter(): WeatherAdapter {
  return process.env.WEATHER_API_KEY ? new KmaWeatherAdapter() : new MockWeatherAdapter();
}
```

KmaWeatherAdapter는 **이번 스프린트 밖**. 자리만 확보.

### 8.4 서버 캐시

```ts
const cache = new Map<string, { data: WeatherSnapshot; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000;
```

라우트 핸들러에서 체크 → 만료 시 adapter 호출. 5000 동시 요청 시에도 실 API는 10분당 1회만 호출됨.

## 9. 실시간 Chat — 상세

### 9.1 연결 생명주기

```
Client mount
  └─ EventSource('/api/chat/stream')
      ├─ server: LISTEN chat_ws_{workspaceId}
      ├─ heartbeat every 15s  → `: keepalive\n\n`
      ├─ on NOTIFY:
      │   └─ SELECT {row}; SSE event payload 전송
      └─ on disconnect: UNLISTEN + release pg client
```

### 9.2 Optimistic UI

- 전송 즉시: local `messages` 배열에 temp id(`_tmp_${uuid}`) 추가 → 서버 응답으로 real id 교체.
- 리액션 토글: local `reactions` 즉시 업데이트 → 서버 실패 시 rollback + 에러 토스트.

### 9.3 Online count

- `GET /api/chat/online?workspaceId=...` → `{ count }` 
- 쿼리: `SELECT COUNT(DISTINCT user_id) FROM user_session WHERE workspace_id = $1 AND updated_at > now() - interval '5 minutes'`
- SWR 30초 간격. 초기값은 SSR에서 동반 전달.

### 9.4 SSE Pool 분리

`apps/web/lib/db/chat-listen-pool.ts`:
```ts
import { Pool } from "pg";
export const chatListenPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.CHAT_PG_MAX ?? 200),
  idleTimeoutMillis: 0,
});
```

기본 Drizzle pool과 분리 → SSE 장기 연결이 앱 쿼리 풀 고갈시키지 않음.

## 10. 테스트 전략

### 10.1 Unit (Vitest)

| 파일 | 범위 |
|------|------|
| `lib/queries/dashboard-notices.test.ts` | pinned 정렬 · 만료 필터 · sensitivity |
| `lib/queries/dashboard-vacations.test.ts` | 주 오버랩 경계 · cancelled 제외 |
| `lib/queries/dashboard-wiki.test.ts` | sensitivity · created_at 정렬 · limit |
| `lib/queries/chat.test.ts` | listRecentMessages · listReactionsForMessages |
| `lib/queries/contractors.test.ts` | listLeaveSummary: 기준일자 오버랩 · 사용시간 집계 |
| `app/actions/chat.test.ts` | body 2000자 · 화이트리스트 · deleted 본인/ADMIN |
| `app/(app)/contractors/leaves/actions.test.ts` | saveLeaveBatch 원자성 · 권한 |
| `lib/adapters/external/weather/mock.test.ts` | shape · 결정적 |
| `lib/adapters/external/fx/mock.test.ts` | shape · 결정적 |

### 10.2 Integration

| 파일 | 범위 |
|------|------|
| `app/api/chat/stream/route.test.ts` | pg_notify 송수신 · heartbeat · abort cleanup |
| `app/api/weather/route.test.ts` | 캐시 hit/miss · fail-soft |
| `app/api/fx/route.test.ts` | 동일 |

### 10.3 E2E (Playwright) — PR 직전만

| 파일 | 시나리오 |
|------|---------|
| `e2e/dashboard-redesign.spec.ts` | 로드 · Hero 4카드 · 3 위젯 · 카피바라 |
| `e2e/lounge-chat.spec.ts` | 2탭 SSE 동기화 · 리액션 토글 · 본인 삭제 |
| `e2e/contractors-leaves.spec.ts` | 탭 순서 · master-detail 선택 · 입력 → 저장 |

### 10.4 완료 게이트

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm test -- --run dashboard chat contractors
pnpm db:generate
node scripts/check-schema-drift.mjs --precommit
pnpm audit:rsc
pnpm --filter @jarvis/web exec playwright test dashboard-redesign lounge-chat contractors-leaves
```

`pnpm wiki:check` 및 `pnpm eval:budget-test` 는 AI·wiki-fs 변경 없음 → 생략.

## 11. 위험 & 완화

| 위험 | 영향 | 완화 |
|------|-----|------|
| SSE 커넥션 PG 세션 고갈 (5000동접) | 앱 전체 DB 풀 고갈 | 전용 `chatListenPool(max=200)` 분리, Phase 2에 pgbouncer 검토 |
| `pg_notify` 8KB payload 한계 | 이벤트 누락 | payload에 id+kind만, SSE에서 재조회 |
| 이모지 임의 문자열 주입 | 화면 깨짐·스팸 | 서버 액션 + DB CHECK 이중 방어 |
| Hero 외부 API 실패로 대시보드 빈 화면 | UX 치명 | 카드 단위 error boundary · API 항상 200 + `{status: 'error'}` |
| Mock↔실 API shape 불일치 | 프론트 재작업 | 어댑터 인터페이스 선행 정의 |
| SSR/CSR 시간 틱 미스매치 | 콘솔 경고 | `TimeCard` `useEffect` 마운트 후 시작, SSR은 placeholder |
| Chat 무한 스크롤 없음 (최초 50) | 과거 이력 조회 불가 | Phase 1 허용, 향후 `/chat/history` 분리 |
| 북마크 깨짐 (`/contractors/schedule`) | 사용자 혼란 | 동일 컴포넌트 유지, redirect 없음 |
| 휴가 batch 부분 실패 | 데이터 불일치 | `db.transaction` 원자 + rollback |
| Sensitivity 필터 누락 | 정보 유출 | 3 위젯 쿼리 DB-level WHERE 강제, code-quality-reviewer 체크 |

## 12. 마이그레이션 & 배포

### 12.1 DB

- `pnpm db:generate` → `NNNN_create_chat.sql`
- `pnpm db:migrate` (dev / staging / prod 순서)
- 데이터 이행 없음

### 12.2 환경변수

`.env.example` 추가:
```
WEATHER_API_KEY=            # 기상청 공공데이터포털 키 (미설정시 Mock)
WEATHER_REGION_CODE=11B10101
EXIM_API_KEY=               # 한국수출입은행 키 (미설정시 Mock)
CHAT_PG_MAX=200             # SSE 전용 pool 최대 연결 수
```

### 12.3 배포 순서

1. 마이그레이션 (chat 테이블 생성)
2. 워커 배포 (chat 관련 워커 없으므로 영향 없음)
3. Web 배포
4. Smoke: `/dashboard` 로드 → Hero·3 위젯 렌더 · 라운지 메시지 전송·수신

### 12.4 롤백

- Web 롤백: 이전 커밋으로 재배포 → 기존 5 위젯 대시보드 복원
- DB 롤백: `chat_*` 테이블 drop (데이터 손실 감수). 단, Phase 1 수준에서는 거의 필요 없음.

## 13. 파일 변경 순서 (jarvis-architecture 20단계 순응)

```
 1. packages/db/schema/chat.ts + index.ts
 2. pnpm db:generate
 3. packages/shared/constants/chat.ts, packages/shared/validation/chat.ts
 4. (권한 없음 — 건너뜀)
 5. (auth 변경 없음 — 건너뜀)
 6. (secret 변경 없음 — 건너뜀)
 7. (wiki-fs 변경 없음 — 건너뜀)
 8. (wiki-agent 변경 없음 — 건너뜀)
 9. (AI 변경 없음 — 건너뜀)
10. (search 변경 없음 — 건너뜀)
11. apps/web/lib/adapters/external/{weather,fx}/**
    apps/web/lib/db/chat-listen-pool.ts
    apps/web/lib/queries/{dashboard-notices, dashboard-vacations, dashboard-wiki, chat}.ts
    apps/web/lib/queries/contractors.ts 확장
12. (공유 actions 변경 없음 — 건너뜀)
13. apps/web/app/actions/chat.ts
    apps/web/app/(app)/contractors/leaves/actions.ts
14. apps/web/app/api/{chat/*, weather, fx}/route.ts
15. apps/web/app/(app)/dashboard/page.tsx 재작성
    apps/web/app/(app)/contractors/page.tsx · schedule/page.tsx · leaves/page.tsx · layout.tsx
16. dashboard/_components/* · components/contractors/{Leave*,ContractorTabs}.tsx
17. apps/web/messages/ko.json 배치
18. (ingest 변경 없음 — 건너뜀)
19. (worker 변경 없음 — 건너뜀)
20. 테스트 파일
```

## 14. Out-of-scope 재확인

- 다중 채널·DM·멘션·파일 첨부·채팅 검색·무한 스크롤·타이핑 인디케이터
- 실 기상청·수출입은행 API 연동 (어댑터 자리만)
- 외주 신규 계약 UI
- 휴가 승인 워크플로
- 위젯 개인화·이모지 팔레트 확장
- 모바일 반응형 (데스크톱 레이아웃 기준)
- E2E 암호화·장기 보관 정책

## 15. 예상 Diff 규모

- 신규 파일 ≈ 40
- 삭제 파일 ≈ 10
- 수정 파일 ≈ 10
- Total LOC 변동 ≈ +3500/-1500

---

**리뷰 요청**: 본 스펙을 읽고 누락·모호·위험 사항을 알려주세요. 승인되면 `superpowers:writing-plans`로 세부 구현 계획을 작성합니다.
