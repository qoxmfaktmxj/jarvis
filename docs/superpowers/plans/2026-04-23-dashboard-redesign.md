# Dashboard Redesign + Lounge Chat + Contractors Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis 대시보드를 포털 허브(인사말 + Hero 4카드 + 전사 라운지 채팅 + 공지/금주휴가/최신위키 3위젯)로 재구성하고, 외주인력관리 탭 구조를 정리(자동 목록·일정 기본·휴가관리 Master-Detail)한다.

**Architecture:** Next.js 15 App Router (RSC + client components) + Postgres `LISTEN/NOTIFY` 기반 SSE 라운지 채팅 + Mock 어댑터 패턴 외부 API(날씨·환율). 신규 도메인 `chat`(2 테이블), 기존 테이블 스키마 변경 없음. i18n 배치 재구성.

**Tech Stack:** Next.js 15, React 19, Drizzle ORM, Postgres 16, `pg` Pool, SSE(ReadableStream), SWR, Tailwind CSS 4, Vitest, Playwright, Zod, next-intl.

**Spec:** [docs/superpowers/specs/2026-04-23-dashboard-redesign-design.md](../specs/2026-04-23-dashboard-redesign-design.md)

---

## File Structure

신규/변경/삭제 파일 목록 (스펙 §4.7 요약):

**신규 (40개)**
- `packages/db/schema/chat.ts`
- `packages/db/drizzle/NNNN_create_chat.sql` (generated)
- `packages/shared/constants/chat.ts`
- `packages/shared/validation/chat.ts`
- `apps/web/lib/adapters/external/weather/{types,index,mock}.ts`
- `apps/web/lib/adapters/external/fx/{types,index,mock}.ts`
- `apps/web/lib/db/chat-listen-pool.ts`
- `apps/web/lib/queries/{dashboard-notices,dashboard-vacations,dashboard-wiki,chat}.ts`
- `apps/web/app/actions/chat.ts`
- `apps/web/app/(app)/contractors/leaves/{page.tsx,actions.ts}`
- `apps/web/app/api/chat/{stream,send,reactions,online}/route.ts`
- `apps/web/app/api/{weather,fx}/route.ts`
- `apps/web/app/(app)/dashboard/_components/{HeroGreeting,InfoCardRow,DateCard,TimeCard,WeatherCard,FxCard,LoungeChat,ChatMessage,ChatComposer,ReactionPopover,ReactionChipRow,NoticesWidget,VacationsWidget,LatestWikiWidget}.tsx`
- `apps/web/components/contractors/{LeaveManagementPanel,LeaveMasterTable,LeaveDetailTable}.tsx`
- `apps/web/public/mascot/capybara.svg`
- Test files (약 15개)

**변경**
- `packages/db/schema/index.ts` (chat export)
- `apps/web/app/(app)/dashboard/page.tsx` (재작성)
- `apps/web/app/(app)/contractors/{page.tsx,layout.tsx,schedule/page.tsx}`
- `apps/web/components/contractors/ContractorTabs.tsx`
- `apps/web/lib/queries/contractors.ts` (listLeaveSummary 추가)
- `apps/web/lib/queries/dashboard.ts` (미사용 export 정리)
- `apps/web/messages/ko.json`
- `.env.example`

**삭제**
- `apps/web/app/(app)/dashboard/_components/{MyTasksWidget,QuickLinksWidget,RecentActivityWidget,SearchTrendsWidget,StalePagesWidget,StatCard,DashboardActivityList,DashboardQuickQuestions}.tsx` (+ 2 테스트)
- `apps/web/components/contractors/{NewContractorModal,ContractorTable,ContractorDrawer,LeaveAddModal}.tsx`

---

## Task Phases

1. Foundation (Tasks 1–4): DB schema, shared constants/validation, env
2. Adapters (Tasks 5–6): weather/fx Mock
3. Queries (Tasks 7–11): dashboard widgets + chat + leave-summary
4. Infrastructure (Tasks 12–15): listen pool, API routes (weather/fx/chat-online)
5. Server actions (Tasks 16–17): chat + leaves batch
6. SSE stream (Task 18)
7. Dashboard UI (Tasks 19–23): Hero · InfoCards · LoungeChat · RightRail · page reassembly
8. Contractors refactor (Tasks 24–27)
9. i18n (Task 28)
10. E2E + final gates (Tasks 29–30)

---

## Task 1: Chat schema + migration

**Files:**
- Create: `packages/db/schema/chat.ts`
- Modify: `packages/db/schema/index.ts`
- Generated: `packages/db/drizzle/NNNN_create_chat.sql`

- [ ] **Step 1: Write schema file**

Create `packages/db/schema/chat.ts`:
```ts
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { workspace } from "./tenant.js";
import { user } from "./user.js";

export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (t) => ({
    wsCreatedIdx: index("idx_chat_msg_ws_created").on(
      t.workspaceId,
      t.createdAt
    )
  })
);

export const chatReaction = pgTable(
  "chat_reaction",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessage.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    emojiCheck: check(
      "chat_reaction_emoji_chk",
      sql`emoji IN ('👍','❤️','🎉','😂','🙏')`
    )
  })
);

export const chatMessageRelations = relations(chatMessage, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [chatMessage.workspaceId],
    references: [workspace.id]
  }),
  author: one(user, {
    fields: [chatMessage.userId],
    references: [user.id]
  }),
  reactions: many(chatReaction)
}));

export const chatReactionRelations = relations(chatReaction, ({ one }) => ({
  message: one(chatMessage, {
    fields: [chatReaction.messageId],
    references: [chatMessage.id]
  }),
  user: one(user, {
    fields: [chatReaction.userId],
    references: [user.id]
  })
}));
```

- [ ] **Step 2: Add export**

Append to `packages/db/schema/index.ts`:
```ts
export * from "./chat.js";
```

- [ ] **Step 3: Generate migration**

Run: `pnpm db:generate`
Expected: 새 파일 `packages/db/drizzle/NNNN_<name>.sql` 생성. 내용에 `CREATE TABLE chat_message`, `CREATE TABLE chat_reaction`, CHECK 제약, 인덱스 포함.

- [ ] **Step 4: Verify drift passes**

Run: `node scripts/check-schema-drift.mjs --precommit`
Expected: exit 0 ("no drift").

- [ ] **Step 5: Commit**

```bash
git add packages/db/schema/chat.ts packages/db/schema/index.ts packages/db/drizzle/
git commit -m "feat(db): add chat_message + chat_reaction tables"
```

---

## Task 2: Chat constants + validation

**Files:**
- Create: `packages/shared/constants/chat.ts`
- Create: `packages/shared/validation/chat.ts`
- Create: `packages/shared/validation/chat.test.ts`

- [ ] **Step 1: Constants**

Create `packages/shared/constants/chat.ts`:
```ts
export const CHAT_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "🎉",
  "😂",
  "🙏"
] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export const CHAT_MESSAGE_MAX_CHARS = 2000;
export const CHAT_INITIAL_LOAD = 50;
export const CHAT_ONLINE_WINDOW_MINUTES = 5;
```

- [ ] **Step 2: Write failing test**

Create `packages/shared/validation/chat.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  sendMessageInputSchema,
  toggleReactionInputSchema
} from "./chat.js";

describe("sendMessageInputSchema", () => {
  it("accepts 1..2000 chars after trim", () => {
    expect(sendMessageInputSchema.parse({ body: "hi" }).body).toBe("hi");
    expect(sendMessageInputSchema.parse({ body: "  hi  " }).body).toBe("hi");
  });
  it("rejects empty and >2000", () => {
    expect(() => sendMessageInputSchema.parse({ body: "" })).toThrow();
    expect(() => sendMessageInputSchema.parse({ body: "   " })).toThrow();
    expect(() =>
      sendMessageInputSchema.parse({ body: "x".repeat(2001) })
    ).toThrow();
  });
});

describe("toggleReactionInputSchema", () => {
  it("accepts whitelist emoji", () => {
    const out = toggleReactionInputSchema.parse({
      messageId: "00000000-0000-0000-0000-000000000001",
      emoji: "👍"
    });
    expect(out.emoji).toBe("👍");
  });
  it("rejects non-whitelist emoji", () => {
    expect(() =>
      toggleReactionInputSchema.parse({
        messageId: "00000000-0000-0000-0000-000000000001",
        emoji: "🔥"
      })
    ).toThrow();
  });
  it("rejects non-uuid messageId", () => {
    expect(() =>
      toggleReactionInputSchema.parse({
        messageId: "not-uuid",
        emoji: "👍"
      })
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @jarvis/shared test chat`
Expected: FAIL — `sendMessageInputSchema` not defined.

- [ ] **Step 4: Implement validation**

Create `packages/shared/validation/chat.ts`:
```ts
import { z } from "zod";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_REACTION_EMOJIS
} from "../constants/chat.js";

export const sendMessageInputSchema = z.object({
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, "empty")
        .max(CHAT_MESSAGE_MAX_CHARS, "too-long")
    )
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

export const toggleReactionInputSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.enum(CHAT_REACTION_EMOJIS)
});

export type ToggleReactionInput = z.infer<typeof toggleReactionInputSchema>;

export const deleteMessageInputSchema = z.object({
  messageId: z.string().uuid()
});

export type DeleteMessageInput = z.infer<typeof deleteMessageInputSchema>;
```

- [ ] **Step 5: Run test to verify pass**

Run: `pnpm --filter @jarvis/shared test chat`
Expected: PASS (7 assertions).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/constants/chat.ts packages/shared/validation/chat.ts packages/shared/validation/chat.test.ts
git commit -m "feat(shared): chat reaction emojis + Zod schemas"
```

---

## Task 3: Environment variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add env vars**

Append to `.env.example` (check for trailing blank line first):
```
# Dashboard external APIs (optional — fallback to Mock when unset)
WEATHER_API_KEY=
WEATHER_REGION_CODE=11B10101
EXIM_API_KEY=

# Chat SSE dedicated pool
CHAT_PG_MAX=200
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add dashboard + chat env vars"
```

---

## Task 4: Weather adapter (types + Mock)

**Files:**
- Create: `apps/web/lib/adapters/external/weather/types.ts`
- Create: `apps/web/lib/adapters/external/weather/mock.ts`
- Create: `apps/web/lib/adapters/external/weather/index.ts`
- Create: `apps/web/lib/adapters/external/weather/mock.test.ts`

- [ ] **Step 1: Types**

Create `apps/web/lib/adapters/external/weather/types.ts`:
```ts
export type WeatherCondition =
  | "맑음"
  | "구름많음"
  | "흐림"
  | "비"
  | "눈"
  | "소나기";

export type WeatherParticulate = "좋음" | "보통" | "나쁨" | "매우나쁨";

export type WeatherSnapshot = {
  region: string;
  regionLabel: string;
  condition: WeatherCondition;
  tempC: number;
  hiC: number;
  loC: number;
  particulate: WeatherParticulate;
  source: "mock" | "kma";
  fetchedAt: string; // ISO
};

export interface WeatherAdapter {
  getSnapshot(region: string): Promise<WeatherSnapshot>;
}
```

- [ ] **Step 2: Write failing test**

Create `apps/web/lib/adapters/external/weather/mock.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MockWeatherAdapter } from "./mock.js";

describe("MockWeatherAdapter", () => {
  it("returns seoul snapshot with source=mock and valid shape", async () => {
    const a = new MockWeatherAdapter();
    const snap = await a.getSnapshot("seoul");
    expect(snap.source).toBe("mock");
    expect(snap.region).toBe("seoul");
    expect(snap.regionLabel).toBe("서울");
    expect(snap.condition).toBe("맑음");
    expect(snap.tempC).toBe(18);
    expect(snap.hiC).toBe(22);
    expect(snap.loC).toBe(12);
    expect(snap.particulate).toBe("좋음");
    expect(new Date(snap.fetchedAt).getTime()).not.toBeNaN();
  });
  it("defaults unknown region to seoul", async () => {
    const a = new MockWeatherAdapter();
    const snap = await a.getSnapshot("atlantis");
    expect(snap.region).toBe("seoul");
    expect(snap.regionLabel).toBe("서울");
  });
});
```

- [ ] **Step 3: Run test (fails)**

Run: `pnpm --filter @jarvis/web test adapters/external/weather/mock`
Expected: FAIL — `MockWeatherAdapter` not defined.

- [ ] **Step 4: Implement Mock**

Create `apps/web/lib/adapters/external/weather/mock.ts`:
```ts
import type { WeatherAdapter, WeatherSnapshot } from "./types.js";

const MOCK: Omit<WeatherSnapshot, "fetchedAt"> = {
  region: "seoul",
  regionLabel: "서울",
  condition: "맑음",
  tempC: 18,
  hiC: 22,
  loC: 12,
  particulate: "좋음",
  source: "mock"
};

export class MockWeatherAdapter implements WeatherAdapter {
  async getSnapshot(_region: string): Promise<WeatherSnapshot> {
    return { ...MOCK, fetchedAt: new Date().toISOString() };
  }
}
```

- [ ] **Step 5: Adapter selector**

Create `apps/web/lib/adapters/external/weather/index.ts`:
```ts
import type { WeatherAdapter } from "./types.js";
import { MockWeatherAdapter } from "./mock.js";

export type { WeatherAdapter, WeatherSnapshot } from "./types.js";

export function getWeatherAdapter(): WeatherAdapter {
  // Phase 1: Mock only. Real KMA adapter planned for a later sprint.
  return new MockWeatherAdapter();
}
```

- [ ] **Step 6: Run test (passes)**

Run: `pnpm --filter @jarvis/web test adapters/external/weather/mock`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/adapters/external/weather/
git commit -m "feat(web): weather adapter interface + Mock (seoul)"
```

---

## Task 5: FX adapter (types + Mock)

**Files:**
- Create: `apps/web/lib/adapters/external/fx/types.ts`
- Create: `apps/web/lib/adapters/external/fx/mock.ts`
- Create: `apps/web/lib/adapters/external/fx/index.ts`
- Create: `apps/web/lib/adapters/external/fx/mock.test.ts`

- [ ] **Step 1: Types**

Create `apps/web/lib/adapters/external/fx/types.ts`:
```ts
export type FxCurrency = "USD" | "EUR" | "JPY";

export type FxRate = {
  code: FxCurrency;
  value: number;
  delta: number; // % vs 전일
  basis: "1" | "100"; // JPY = "100"
};

export type FxSnapshot = {
  rates: FxRate[];
  source: "mock" | "exim";
  fetchedAt: string;
};

export interface FxAdapter {
  getSnapshot(): Promise<FxSnapshot>;
}
```

- [ ] **Step 2: Write failing test**

Create `apps/web/lib/adapters/external/fx/mock.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MockFxAdapter } from "./mock.js";

describe("MockFxAdapter", () => {
  it("returns USD/EUR/JPY snapshot with source=mock", async () => {
    const a = new MockFxAdapter();
    const snap = await a.getSnapshot();
    expect(snap.source).toBe("mock");
    const codes = snap.rates.map((r) => r.code);
    expect(codes).toEqual(["USD", "EUR", "JPY"]);
    const jpy = snap.rates.find((r) => r.code === "JPY")!;
    expect(jpy.basis).toBe("100");
    const usd = snap.rates.find((r) => r.code === "USD")!;
    expect(usd.basis).toBe("1");
    expect(usd.value).toBe(1342);
    expect(new Date(snap.fetchedAt).getTime()).not.toBeNaN();
  });
});
```

- [ ] **Step 3: Run test (fails)**

Run: `pnpm --filter @jarvis/web test adapters/external/fx/mock`
Expected: FAIL.

- [ ] **Step 4: Implement Mock**

Create `apps/web/lib/adapters/external/fx/mock.ts`:
```ts
import type { FxAdapter, FxSnapshot } from "./types.js";

const MOCK_RATES = [
  { code: "USD", value: 1342, delta: 0.3, basis: "1" },
  { code: "EUR", value: 1458, delta: -0.1, basis: "1" },
  { code: "JPY", value: 892, delta: 0.5, basis: "100" }
] as const;

export class MockFxAdapter implements FxAdapter {
  async getSnapshot(): Promise<FxSnapshot> {
    return {
      rates: MOCK_RATES.map((r) => ({ ...r })),
      source: "mock",
      fetchedAt: new Date().toISOString()
    };
  }
}
```

- [ ] **Step 5: Adapter selector**

Create `apps/web/lib/adapters/external/fx/index.ts`:
```ts
import type { FxAdapter } from "./types.js";
import { MockFxAdapter } from "./mock.js";

export type { FxAdapter, FxSnapshot, FxRate, FxCurrency } from "./types.js";

export function getFxAdapter(): FxAdapter {
  return new MockFxAdapter();
}
```

- [ ] **Step 6: Run test (passes)**

Run: `pnpm --filter @jarvis/web test adapters/external/fx/mock`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/adapters/external/fx/
git commit -m "feat(web): fx adapter interface + Mock (USD/EUR/JPY)"
```

---

## Task 6: Dashboard notices query

**Files:**
- Create: `apps/web/lib/queries/dashboard-notices.ts`
- Create: `apps/web/lib/queries/dashboard-notices.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/lib/queries/dashboard-notices.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { orderDashboardNotices, filterDashboardNotices } from "./dashboard-notices.js";

type N = Parameters<typeof orderDashboardNotices>[0][number];

const now = new Date("2026-04-23T09:00:00Z");

function make(p: Partial<N>): N {
  return {
    id: p.id ?? "n",
    title: p.title ?? "t",
    bodyMd: p.bodyMd ?? "",
    sensitivity: p.sensitivity ?? "INTERNAL",
    pinned: p.pinned ?? false,
    publishedAt: p.publishedAt ?? new Date("2026-04-22T00:00:00Z"),
    expiresAt: p.expiresAt ?? null,
    authorId: p.authorId ?? "u",
    authorName: p.authorName ?? "테스터",
    createdAt: p.createdAt ?? new Date("2026-04-22T00:00:00Z")
  };
}

describe("filterDashboardNotices", () => {
  it("drops unpublished", () => {
    const rows = [make({ id: "a", publishedAt: null }), make({ id: "b" })];
    expect(filterDashboardNotices(rows, now).map((r) => r.id)).toEqual(["b"]);
  });
  it("drops expired", () => {
    const rows = [
      make({ id: "expired", expiresAt: new Date("2026-04-20T00:00:00Z") }),
      make({ id: "live", expiresAt: new Date("2026-04-24T00:00:00Z") })
    ];
    expect(filterDashboardNotices(rows, now).map((r) => r.id)).toEqual(["live"]);
  });
});

describe("orderDashboardNotices", () => {
  it("pinned first, then publishedAt desc", () => {
    const rows = [
      make({ id: "old-pinned", pinned: true, publishedAt: new Date("2026-04-01T00:00:00Z") }),
      make({ id: "new-plain", pinned: false, publishedAt: new Date("2026-04-23T00:00:00Z") }),
      make({ id: "new-pinned", pinned: true, publishedAt: new Date("2026-04-22T00:00:00Z") })
    ];
    const out = orderDashboardNotices(rows);
    expect(out.map((r) => r.id)).toEqual(["new-pinned", "old-pinned", "new-plain"]);
  });
});
```

- [ ] **Step 2: Run test (fails)**

Run: `pnpm --filter @jarvis/web test queries/dashboard-notices`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/lib/queries/dashboard-notices.ts`:
```ts
import { and, desc, eq, isNotNull, isNull, or, gt, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { notice, user } from "@jarvis/db/schema";

export interface DashboardNoticeRow {
  id: string;
  title: string;
  bodyMd: string;
  sensitivity: "PUBLIC" | "INTERNAL";
  pinned: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export function filterDashboardNotices(
  rows: DashboardNoticeRow[],
  now: Date = new Date()
): DashboardNoticeRow[] {
  return rows.filter(
    (r) =>
      r.publishedAt !== null &&
      (r.expiresAt === null || r.expiresAt.getTime() > now.getTime())
  );
}

export function orderDashboardNotices(
  rows: DashboardNoticeRow[]
): DashboardNoticeRow[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const pa = a.publishedAt?.getTime() ?? 0;
    const pb = b.publishedAt?.getTime() ?? 0;
    return pb - pa;
  });
}

export async function listDashboardNotices(
  workspaceId: string,
  limit = 5,
  now: Date = new Date(),
  database: typeof db = db
): Promise<DashboardNoticeRow[]> {
  const rows = await database
    .select({
      id: notice.id,
      title: notice.title,
      bodyMd: notice.bodyMd,
      sensitivity: notice.sensitivity,
      pinned: notice.pinned,
      publishedAt: notice.publishedAt,
      expiresAt: notice.expiresAt,
      authorId: notice.authorId,
      authorName: user.name,
      createdAt: notice.createdAt
    })
    .from(notice)
    .innerJoin(user, eq(notice.authorId, user.id))
    .where(
      and(
        eq(notice.workspaceId, workspaceId),
        isNotNull(notice.publishedAt),
        or(isNull(notice.expiresAt), gt(notice.expiresAt, sql`${now}::timestamptz`))
      )
    )
    .orderBy(desc(notice.pinned), desc(notice.publishedAt))
    .limit(limit);

  return rows as DashboardNoticeRow[];
}
```

- [ ] **Step 4: Run test (passes)**

Run: `pnpm --filter @jarvis/web test queries/dashboard-notices`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/dashboard-notices.ts apps/web/lib/queries/dashboard-notices.test.ts
git commit -m "feat(dashboard): list notices query (pinned + published + not-expired)"
```

---

## Task 7: Dashboard vacations query

**Files:**
- Create: `apps/web/lib/queries/dashboard-vacations.ts`
- Create: `apps/web/lib/queries/dashboard-vacations.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/lib/queries/dashboard-vacations.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  filterWeekVacations,
  computeWeekBounds
} from "./dashboard-vacations.js";

type V = Parameters<typeof filterWeekVacations>[0][number];

function make(p: Partial<V>): V {
  return {
    id: p.id ?? "l",
    userId: p.userId ?? "u",
    userName: p.userName ?? "홍길동",
    orgName: p.orgName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    type: p.type ?? "annual",
    startDate: p.startDate ?? "2026-04-22",
    endDate: p.endDate ?? "2026-04-24",
    hours: p.hours ?? 24,
    reason: p.reason ?? null,
    cancelledAt: p.cancelledAt ?? null,
    status: p.status ?? "approved"
  };
}

describe("computeWeekBounds", () => {
  it("Thursday 2026-04-23 → Mon 2026-04-20 to Sun 2026-04-26", () => {
    const b = computeWeekBounds(new Date("2026-04-23T09:00:00+09:00"));
    expect(b.weekStart).toBe("2026-04-20");
    expect(b.weekEnd).toBe("2026-04-26");
  });
  it("Sunday handled as end of week", () => {
    const b = computeWeekBounds(new Date("2026-04-26T12:00:00+09:00"));
    expect(b.weekStart).toBe("2026-04-20");
    expect(b.weekEnd).toBe("2026-04-26");
  });
});

describe("filterWeekVacations", () => {
  const bounds = { weekStart: "2026-04-20", weekEnd: "2026-04-26" };
  it("keeps overlapping leaves, drops outside + cancelled", () => {
    const rows = [
      make({ id: "in", startDate: "2026-04-22", endDate: "2026-04-24" }),
      make({ id: "cross-start", startDate: "2026-04-18", endDate: "2026-04-21" }),
      make({ id: "cross-end", startDate: "2026-04-26", endDate: "2026-04-28" }),
      make({ id: "before", startDate: "2026-04-10", endDate: "2026-04-12" }),
      make({ id: "after", startDate: "2026-04-30", endDate: "2026-05-02" }),
      make({
        id: "cancelled",
        cancelledAt: new Date("2026-04-22T00:00:00Z"),
        startDate: "2026-04-22",
        endDate: "2026-04-24"
      }),
      make({
        id: "rejected",
        status: "rejected",
        startDate: "2026-04-22",
        endDate: "2026-04-24"
      })
    ];
    const out = filterWeekVacations(rows, bounds);
    expect(out.map((r) => r.id).sort()).toEqual(
      ["cross-end", "cross-start", "in"].sort()
    );
  });
});
```

- [ ] **Step 2: Run test (fails)**

Run: `pnpm --filter @jarvis/web test queries/dashboard-vacations`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/lib/queries/dashboard-vacations.ts`:
```ts
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { leaveRequest, user, organization } from "@jarvis/db/schema";

export interface DashboardVacationRow {
  id: string;
  userId: string;
  userName: string;
  orgName: string | null;
  avatarUrl: string | null;
  type: string; // annual | halfAm | halfPm | sick | family
  startDate: string; // yyyy-mm-dd
  endDate: string;
  hours: number;
  reason: string | null;
  cancelledAt: Date | null;
  status: string; // approved | pending | rejected
}

export function computeWeekBounds(now: Date): {
  weekStart: string;
  weekEnd: string;
} {
  const offsetMs = 9 * 60 * 60 * 1000;
  const ko = new Date(now.getTime() + offsetMs);
  const dow = ko.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow; // Monday-start week
  const start = new Date(ko);
  start.setUTCDate(start.getUTCDate() + delta);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

export function filterWeekVacations(
  rows: DashboardVacationRow[],
  bounds: { weekStart: string; weekEnd: string }
): DashboardVacationRow[] {
  return rows.filter(
    (r) =>
      r.cancelledAt === null &&
      r.status === "approved" &&
      r.startDate <= bounds.weekEnd &&
      r.endDate >= bounds.weekStart
  );
}

export async function listWeekVacations(
  workspaceId: string,
  now: Date = new Date(),
  limit = 10,
  database: typeof db = db
): Promise<DashboardVacationRow[]> {
  const { weekStart, weekEnd } = computeWeekBounds(now);

  const rows = await database
    .select({
      id: leaveRequest.id,
      userId: leaveRequest.userId,
      userName: user.name,
      orgName: organization.name,
      avatarUrl: user.avatarUrl,
      type: leaveRequest.type,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      hours: leaveRequest.hours,
      reason: leaveRequest.reason,
      cancelledAt: leaveRequest.cancelledAt,
      status: leaveRequest.status
    })
    .from(leaveRequest)
    .innerJoin(user, eq(leaveRequest.userId, user.id))
    .leftJoin(organization, eq(user.orgId, organization.id))
    .where(
      and(
        eq(leaveRequest.workspaceId, workspaceId),
        isNull(leaveRequest.cancelledAt),
        eq(leaveRequest.status, "approved"),
        lte(leaveRequest.startDate, weekEnd),
        gte(leaveRequest.endDate, weekStart)
      )
    )
    .orderBy(asc(leaveRequest.startDate), asc(user.name))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    hours: Number(r.hours)
  })) as DashboardVacationRow[];
}
```

- [ ] **Step 4: Run test (passes)**

Run: `pnpm --filter @jarvis/web test queries/dashboard-vacations`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/dashboard-vacations.ts apps/web/lib/queries/dashboard-vacations.test.ts
git commit -m "feat(dashboard): list this-week vacations query (KST week, overlap)"
```

---

## Task 8: Dashboard latest-wiki query

**Files:**
- Create: `apps/web/lib/queries/dashboard-wiki.ts`
- Create: `apps/web/lib/queries/dashboard-wiki.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/lib/queries/dashboard-wiki.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { orderLatestWikiPages } from "./dashboard-wiki.js";

type W = Parameters<typeof orderLatestWikiPages>[0][number];

function make(p: Partial<W>): W {
  return {
    id: p.id ?? "w",
    title: p.title ?? "t",
    path: p.path ?? "/p",
    slug: p.slug ?? "p",
    tags: p.tags ?? [],
    authorId: p.authorId ?? "u",
    authorName: p.authorName ?? "작성자",
    createdAt: p.createdAt ?? new Date("2026-04-20T00:00:00Z"),
    updatedAt: p.updatedAt ?? new Date("2026-04-20T00:00:00Z"),
    sensitivity: p.sensitivity ?? "INTERNAL"
  };
}

describe("orderLatestWikiPages", () => {
  it("orders by createdAt desc, limit 10", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      make({
        id: `w${i}`,
        createdAt: new Date(2026, 3, i + 1),
        title: `p${i}`
      })
    );
    const out = orderLatestWikiPages(rows, 10);
    expect(out).toHaveLength(10);
    expect(out[0]!.id).toBe("w14");
    expect(out[9]!.id).toBe("w5");
  });
});
```

- [ ] **Step 2: Run test (fails)**

Run: `pnpm --filter @jarvis/web test queries/dashboard-wiki`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/lib/queries/dashboard-wiki.ts`:
```ts
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex, user } from "@jarvis/db/schema";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

export interface DashboardWikiRow {
  id: string;
  title: string;
  path: string;
  slug: string;
  tags: string[];
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  sensitivity: string;
}

export function orderLatestWikiPages(
  rows: DashboardWikiRow[],
  limit = 10
): DashboardWikiRow[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function listLatestWikiPages(
  workspaceId: string,
  userPermissions: string[],
  limit = 10,
  database: typeof db = db
): Promise<DashboardWikiRow[]> {
  const allowed = getAllowedWikiSensitivityValues(userPermissions);
  if (allowed.length === 0) return [];

  const requiredPermissionGate = userPermissions.includes(PERMISSIONS.ADMIN_ALL)
    ? sql`TRUE`
    : userPermissions.length > 0
      ? or(
          isNull(wikiPageIndex.requiredPermission),
          inArray(wikiPageIndex.requiredPermission, userPermissions)
        )
      : isNull(wikiPageIndex.requiredPermission);

  const rows = await database
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      path: wikiPageIndex.path,
      slug: wikiPageIndex.slug,
      tags: wikiPageIndex.tags,
      authorId: wikiPageIndex.authorId,
      authorName: user.name,
      createdAt: wikiPageIndex.createdAt,
      updatedAt: wikiPageIndex.updatedAt,
      sensitivity: wikiPageIndex.sensitivity
    })
    .from(wikiPageIndex)
    .leftJoin(user, eq(wikiPageIndex.authorId, user.id))
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        inArray(wikiPageIndex.sensitivity, allowed),
        requiredPermissionGate
      )
    )
    .orderBy(desc(wikiPageIndex.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    tags: (r.tags as string[] | null) ?? [],
    authorName: r.authorName ?? "—"
  })) as DashboardWikiRow[];
}
```

Note: `wikiPageIndex.authorId` and `wikiPageIndex.tags` and `wikiPageIndex.requiredPermission` columns — if any is missing or named differently, adapt via grep `packages/db/schema/wiki-page-index.ts` before writing this task. If `authorId` does not exist, drop the join and return `authorName: "—"` unconditionally.

- [ ] **Step 4: Run test (passes)**

Run: `pnpm --filter @jarvis/web test queries/dashboard-wiki`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/dashboard-wiki.ts apps/web/lib/queries/dashboard-wiki.test.ts
git commit -m "feat(dashboard): list latest published wiki pages (sensitivity-filtered)"
```

---

## Task 9: Chat queries (recent messages + reactions)

**Files:**
- Create: `apps/web/lib/queries/chat.ts`
- Create: `apps/web/lib/queries/chat.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/lib/queries/chat.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { aggregateReactions } from "./chat.js";

describe("aggregateReactions", () => {
  it("counts per emoji + marks mine", () => {
    const rows = [
      { messageId: "m1", userId: "u1", emoji: "👍" as const },
      { messageId: "m1", userId: "u2", emoji: "👍" as const },
      { messageId: "m1", userId: "u1", emoji: "❤️" as const },
      { messageId: "m2", userId: "u3", emoji: "🎉" as const }
    ];
    const map = aggregateReactions(rows, "u1");
    expect(map.get("m1")).toEqual([
      { emoji: "👍", count: 2, mine: true },
      { emoji: "❤️", count: 1, mine: true }
    ]);
    expect(map.get("m2")).toEqual([
      { emoji: "🎉", count: 1, mine: false }
    ]);
  });
  it("respects emoji ordering (whitelist order)", () => {
    const rows = [
      { messageId: "m1", userId: "u1", emoji: "🙏" as const },
      { messageId: "m1", userId: "u2", emoji: "👍" as const }
    ];
    const map = aggregateReactions(rows, "u2");
    expect(map.get("m1")!.map((r) => r.emoji)).toEqual(["👍", "🙏"]);
  });
});
```

- [ ] **Step 2: Run test (fails)**

Run: `pnpm --filter @jarvis/web test queries/chat`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/lib/queries/chat.ts`:
```ts
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { chatMessage, chatReaction, user } from "@jarvis/db/schema";
import {
  CHAT_REACTION_EMOJIS,
  type ChatReactionEmoji
} from "@jarvis/shared/constants/chat";

export interface ChatMessageRow {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface ReactionAggregate {
  emoji: ChatReactionEmoji;
  count: number;
  mine: boolean;
}

export function aggregateReactions(
  rows: Array<{
    messageId: string;
    userId: string;
    emoji: ChatReactionEmoji;
  }>,
  viewerId: string
): Map<string, ReactionAggregate[]> {
  const byMsg = new Map<
    string,
    Map<ChatReactionEmoji, { count: number; mine: boolean }>
  >();
  for (const row of rows) {
    const emojiMap = byMsg.get(row.messageId) ?? new Map();
    const prev = emojiMap.get(row.emoji) ?? { count: 0, mine: false };
    emojiMap.set(row.emoji, {
      count: prev.count + 1,
      mine: prev.mine || row.userId === viewerId
    });
    byMsg.set(row.messageId, emojiMap);
  }
  const result = new Map<string, ReactionAggregate[]>();
  for (const [msgId, emojiMap] of byMsg) {
    const ordered: ReactionAggregate[] = [];
    for (const e of CHAT_REACTION_EMOJIS) {
      const entry = emojiMap.get(e);
      if (entry) ordered.push({ emoji: e, ...entry });
    }
    result.set(msgId, ordered);
  }
  return result;
}

export async function listRecentChatMessages(
  workspaceId: string,
  viewerId: string,
  limit = 50,
  database: typeof db = db
): Promise<Array<ChatMessageRow & { reactions: ReactionAggregate[] }>> {
  const messages = await database
    .select({
      id: chatMessage.id,
      workspaceId: chatMessage.workspaceId,
      userId: chatMessage.userId,
      userName: user.name,
      avatarUrl: user.avatarUrl,
      body: chatMessage.body,
      deletedAt: chatMessage.deletedAt,
      createdAt: chatMessage.createdAt
    })
    .from(chatMessage)
    .innerJoin(user, eq(chatMessage.userId, user.id))
    .where(and(eq(chatMessage.workspaceId, workspaceId)))
    .orderBy(desc(chatMessage.createdAt))
    .limit(limit);

  const ids = messages.map((m) => m.id);
  const reactions =
    ids.length === 0
      ? []
      : await database
          .select({
            messageId: chatReaction.messageId,
            userId: chatReaction.userId,
            emoji: chatReaction.emoji
          })
          .from(chatReaction)
          .where(inArray(chatReaction.messageId, ids))
          .orderBy(asc(chatReaction.createdAt));

  const rxMap = aggregateReactions(
    reactions as Array<{
      messageId: string;
      userId: string;
      emoji: ChatReactionEmoji;
    }>,
    viewerId
  );

  return messages
    .reverse() // oldest first for UI
    .map((m) => ({
      ...m,
      reactions: rxMap.get(m.id) ?? []
    })) as Array<ChatMessageRow & { reactions: ReactionAggregate[] }>;
}

export async function getMessageById(
  id: string,
  database: typeof db = db
): Promise<ChatMessageRow | null> {
  const row = await database
    .select({
      id: chatMessage.id,
      workspaceId: chatMessage.workspaceId,
      userId: chatMessage.userId,
      userName: user.name,
      avatarUrl: user.avatarUrl,
      body: chatMessage.body,
      deletedAt: chatMessage.deletedAt,
      createdAt: chatMessage.createdAt
    })
    .from(chatMessage)
    .innerJoin(user, eq(chatMessage.userId, user.id))
    .where(eq(chatMessage.id, id))
    .limit(1);

  return (row[0] as ChatMessageRow | undefined) ?? null;
}

export async function getReactionsForMessage(
  messageId: string,
  viewerId: string,
  database: typeof db = db
): Promise<ReactionAggregate[]> {
  const rows = await database
    .select({
      messageId: chatReaction.messageId,
      userId: chatReaction.userId,
      emoji: chatReaction.emoji
    })
    .from(chatReaction)
    .where(eq(chatReaction.messageId, messageId));

  return (
    aggregateReactions(
      rows as Array<{
        messageId: string;
        userId: string;
        emoji: ChatReactionEmoji;
      }>,
      viewerId
    ).get(messageId) ?? []
  );
}

export async function countOnlineUsers(
  workspaceId: string,
  windowMinutes: number,
  database: typeof db = db
): Promise<number> {
  const { userSession } = await import("@jarvis/db/schema");
  const { count, sql, and, eq, gte } = await import("drizzle-orm");
  const cutoff = new Date(Date.now() - windowMinutes * 60_000);
  const rows = await database
    .select({
      c: count(sql`DISTINCT ${userSession.userId}`)
    })
    .from(userSession)
    .where(
      and(
        eq(userSession.workspaceId, workspaceId),
        gte(userSession.updatedAt, cutoff)
      )
    );
  return Number(rows[0]?.c ?? 0);
}
```

Note: `countOnlineUsers` assumes `user_session` table has `updated_at` / `workspace_id` / `user_id` columns. Before running this task, confirm via `packages/db/schema/user-session.ts`. If column names differ, adapt accordingly (use real column names, do not rename DB).

- [ ] **Step 4: Run test (passes)**

Run: `pnpm --filter @jarvis/web test queries/chat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/chat.ts apps/web/lib/queries/chat.test.ts
git commit -m "feat(chat): list recent messages + reaction aggregation + online count"
```

---

## Task 10: Contractors — listLeaveSummary extension

**Files:**
- Modify: `apps/web/lib/queries/contractors.ts`
- Create: `apps/web/lib/queries/contractors-summary.test.ts`

- [ ] **Step 1: Inspect existing file**

Run: `cat apps/web/lib/queries/contractors.ts` — locate export list, add the new function at the end (do NOT rewrite existing exports).

- [ ] **Step 2: Write failing test**

Create `apps/web/lib/queries/contractors-summary.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildLeaveSummaryRow } from "./contractors.js";

describe("buildLeaveSummaryRow", () => {
  it("computes used / remaining from cancelled-free leaves", () => {
    const row = buildLeaveSummaryRow({
      contractId: "c1",
      userId: "u1",
      employeeId: "SD26001",
      name: "홍길동",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      generatedHours: 80,
      additionalHours: 8,
      note: "연장",
      leaves: [
        { hours: 16, cancelledAt: null, endDate: "2026-03-01" },
        { hours: 8, cancelledAt: new Date(), endDate: "2026-03-05" },
        { hours: 8, cancelledAt: null, endDate: "2026-05-01" }
      ],
      referenceDate: "2026-04-30"
    });
    // used: 16 (both 3-01 and 5-01 included if end<=refDate; 5-01 > refDate → excluded)
    expect(row.usedDays).toBe(2);      // 16/8
    expect(row.generatedDays).toBe(11); // (80+8)/8
    expect(row.remainingDays).toBe(9);
  });
});
```

- [ ] **Step 3: Run test (fails)**

Run: `pnpm --filter @jarvis/web test queries/contractors-summary`
Expected: FAIL.

- [ ] **Step 4: Implement (append to contractors.ts)**

Append to `apps/web/lib/queries/contractors.ts` (do NOT remove existing exports):
```ts
import { contractorContract, leaveRequest, user } from "@jarvis/db/schema";
import { and, eq, gte, isNull, lte, sql, or, ilike } from "drizzle-orm";

export interface LeaveSummaryInput {
  contractId: string;
  userId: string;
  employeeId: string;
  name: string;
  contractStartDate: string;
  contractEndDate: string;
  generatedHours: number;
  additionalHours: number;
  note: string | null;
  leaves: Array<{
    hours: number;
    cancelledAt: Date | null;
    endDate: string;
  }>;
  referenceDate: string;
}

export interface LeaveSummaryRow {
  contractId: string;
  userId: string;
  employeeId: string;
  name: string;
  contractStartDate: string;
  contractEndDate: string;
  generatedDays: number;
  usedDays: number;
  remainingDays: number;
  note: string | null;
}

export function buildLeaveSummaryRow(input: LeaveSummaryInput): LeaveSummaryRow {
  const usedHours = input.leaves
    .filter((l) => l.cancelledAt === null && l.endDate <= input.referenceDate)
    .reduce((sum, l) => sum + Number(l.hours), 0);
  const generatedHours =
    Number(input.generatedHours) + Number(input.additionalHours);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    contractId: input.contractId,
    userId: input.userId,
    employeeId: input.employeeId,
    name: input.name,
    contractStartDate: input.contractStartDate,
    contractEndDate: input.contractEndDate,
    generatedDays: round2(generatedHours / 8),
    usedDays: round2(usedHours / 8),
    remainingDays: round2((generatedHours - usedHours) / 8),
    note: input.note
  };
}

export async function listLeaveSummary(opts: {
  workspaceId: string;
  referenceDate: string; // yyyy-mm-dd
  nameLike?: string;
  currentUserId?: string; // non-admin: only own
  database?: typeof db;
}): Promise<LeaveSummaryRow[]> {
  const database = opts.database ?? db;

  const whereClauses = [
    eq(contractorContract.workspaceId, opts.workspaceId),
    lte(contractorContract.startDate, opts.referenceDate),
    gte(contractorContract.endDate, opts.referenceDate)
  ];
  if (opts.currentUserId) {
    whereClauses.push(eq(contractorContract.userId, opts.currentUserId));
  }
  if (opts.nameLike && opts.nameLike.trim().length > 0) {
    whereClauses.push(ilike(user.name, `%${opts.nameLike.trim()}%`));
  }

  const contracts = await database
    .select({
      contractId: contractorContract.id,
      userId: contractorContract.userId,
      employeeId: user.employeeId,
      name: user.name,
      contractStartDate: contractorContract.startDate,
      contractEndDate: contractorContract.endDate,
      generatedHours: contractorContract.generatedLeaveHours,
      additionalHours: contractorContract.additionalLeaveHours,
      note: contractorContract.note
    })
    .from(contractorContract)
    .innerJoin(user, eq(contractorContract.userId, user.id))
    .where(and(...whereClauses));

  if (contracts.length === 0) return [];

  const contractIds = contracts.map((c) => c.contractId);
  const leaves = await database
    .select({
      contractId: leaveRequest.contractId,
      hours: leaveRequest.hours,
      cancelledAt: leaveRequest.cancelledAt,
      endDate: leaveRequest.endDate
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.workspaceId, opts.workspaceId),
        sql`${leaveRequest.contractId} = ANY(${contractIds})`
      )
    );

  const leavesByContract = new Map<string, typeof leaves>();
  for (const l of leaves) {
    const k = l.contractId;
    const arr = leavesByContract.get(k) ?? [];
    arr.push(l);
    leavesByContract.set(k, arr);
  }

  return contracts.map((c) =>
    buildLeaveSummaryRow({
      ...c,
      generatedHours: Number(c.generatedHours),
      additionalHours: Number(c.additionalHours),
      leaves: (leavesByContract.get(c.contractId) ?? []).map((l) => ({
        hours: Number(l.hours),
        cancelledAt: l.cancelledAt,
        endDate: l.endDate
      })),
      referenceDate: opts.referenceDate
    })
  );
}
```

- [ ] **Step 5: Run test (passes)**

Run: `pnpm --filter @jarvis/web test queries/contractors-summary`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/contractors.ts apps/web/lib/queries/contractors-summary.test.ts
git commit -m "feat(contractors): listLeaveSummary for master-detail page"
```

---

## Task 11: Chat listen pool

**Files:**
- Create: `apps/web/lib/db/chat-listen-pool.ts`

- [ ] **Step 1: Implement**

Create `apps/web/lib/db/chat-listen-pool.ts`:
```ts
import { Pool } from "pg";

let _pool: Pool | null = null;

export function getChatListenPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({
    connectionString: url,
    max: Number(process.env.CHAT_PG_MAX ?? 200),
    idleTimeoutMillis: 0,
    allowExitOnIdle: false
  });
  return _pool;
}

export async function closeChatListenPool(): Promise<void> {
  if (!_pool) return;
  await _pool.end();
  _pool = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/db/chat-listen-pool.ts
git commit -m "feat(chat): dedicated pg Pool for SSE LISTEN connections"
```

---

## Task 12: Weather API route

**Files:**
- Create: `apps/web/app/api/weather/route.ts`
- Create: `apps/web/app/api/weather/route.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/app/api/weather/route.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("GET /api/weather", () => {
  it("returns ok with mock snapshot", async () => {
    const res = await GET(new Request("http://x/api/weather?region=seoul"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.data.region).toBe("seoul");
    expect(body.data.source).toBe("mock");
  });
});
```

- [ ] **Step 2: Run (fails)**

Run: `pnpm --filter @jarvis/web test app/api/weather`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/app/api/weather/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getWeatherAdapter } from "@/lib/adapters/external/weather";
import type { WeatherSnapshot } from "@/lib/adapters/external/weather";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { snap: WeatherSnapshot; expiresAt: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const region = url.searchParams.get("region") ?? "seoul";
  try {
    const now = Date.now();
    const cached = cache.get(region);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(
        { status: "ok", data: cached.snap },
        {
          headers: {
            "Cache-Control": "s-maxage=600, stale-while-revalidate=60"
          }
        }
      );
    }
    const adapter = getWeatherAdapter();
    const snap = await adapter.getSnapshot(region);
    cache.set(region, { snap, expiresAt: now + TTL_MS });
    return NextResponse.json(
      { status: "ok", data: snap },
      {
        headers: {
          "Cache-Control": "s-maxage=600, stale-while-revalidate=60"
        }
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "unknown"
      },
      { status: 200 }
    );
  }
}
```

- [ ] **Step 4: Run (passes)**

Run: `pnpm --filter @jarvis/web test app/api/weather`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/weather/
git commit -m "feat(api): /api/weather with 10-min cache + fail-soft"
```

---

## Task 13: FX API route

**Files:**
- Create: `apps/web/app/api/fx/route.ts`
- Create: `apps/web/app/api/fx/route.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/app/api/fx/route.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("GET /api/fx", () => {
  it("returns USD/EUR/JPY", async () => {
    const res = await GET(new Request("http://x/api/fx"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.data.rates.map((r: { code: string }) => r.code)).toEqual([
      "USD",
      "EUR",
      "JPY"
    ]);
  });
});
```

- [ ] **Step 2: Run (fails)**

Run: `pnpm --filter @jarvis/web test app/api/fx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/app/api/fx/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getFxAdapter } from "@/lib/adapters/external/fx";
import type { FxSnapshot } from "@/lib/adapters/external/fx";

const TTL_MS = 60 * 60 * 1000;
let cached: { snap: FxSnapshot; expiresAt: number } | null = null;

export async function GET(_req: Request) {
  try {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(
        { status: "ok", data: cached.snap },
        {
          headers: {
            "Cache-Control": "s-maxage=3600, stale-while-revalidate=300"
          }
        }
      );
    }
    const snap = await getFxAdapter().getSnapshot();
    cached = { snap, expiresAt: now + TTL_MS };
    return NextResponse.json(
      { status: "ok", data: snap },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=300"
        }
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "unknown"
      },
      { status: 200 }
    );
  }
}
```

- [ ] **Step 4: Run (passes)**

Run: `pnpm --filter @jarvis/web test app/api/fx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/fx/
git commit -m "feat(api): /api/fx with 1-hour cache + fail-soft"
```

---

## Task 14: Chat online count route

**Files:**
- Create: `apps/web/app/api/chat/online/route.ts`

- [ ] **Step 1: Implement**

Create `apps/web/app/api/chat/online/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireSession } from "@jarvis/auth/session";
import { countOnlineUsers } from "@/lib/queries/chat";
import { CHAT_ONLINE_WINDOW_MINUTES } from "@jarvis/shared/constants/chat";

export async function GET() {
  try {
    const session = await requireSession();
    const count = await countOnlineUsers(
      session.workspaceId,
      CHAT_ONLINE_WINDOW_MINUTES
    );
    return NextResponse.json(
      { status: "ok", data: { count } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ status: "error", data: { count: 0 } });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/chat/online/
git commit -m "feat(chat): /api/chat/online count via user_session"
```

---

## Task 15: Chat server actions

**Files:**
- Create: `apps/web/app/actions/chat.ts`
- Create: `apps/web/app/actions/chat.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/app/actions/chat.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { validateSend, validateToggle } from "./chat.js";

describe("chat action validators (pure)", () => {
  it("send: trims + rejects empty", () => {
    expect(validateSend({ body: "  hi  " }).body).toBe("hi");
    expect(() => validateSend({ body: "   " })).toThrow();
    expect(() => validateSend({ body: "x".repeat(2001) })).toThrow();
  });
  it("toggle: enforces whitelist", () => {
    expect(() => validateToggle({ messageId: "bad", emoji: "👍" })).toThrow();
    expect(() =>
      validateToggle({
        messageId: "00000000-0000-0000-0000-000000000001",
        emoji: "🔥" as never
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run (fails)**

Run: `pnpm --filter @jarvis/web test actions/chat`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/app/actions/chat.ts`:
```ts
"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  chatMessage,
  chatReaction,
  auditLog
} from "@jarvis/db/schema";
import { requireSession } from "@jarvis/auth/session";
import {
  sendMessageInputSchema,
  toggleReactionInputSchema,
  deleteMessageInputSchema
} from "@jarvis/shared/validation/chat";
import type { ChatReactionEmoji } from "@jarvis/shared/constants/chat";

export function validateSend(input: unknown) {
  return sendMessageInputSchema.parse(input);
}
export function validateToggle(input: unknown) {
  return toggleReactionInputSchema.parse(input);
}
export function validateDelete(input: unknown) {
  return deleteMessageInputSchema.parse(input);
}

async function notify(channel: string, payload: object) {
  const json = JSON.stringify(payload);
  await db.execute({
    sql: `SELECT pg_notify($1, $2)`,
    args: [channel, json]
  } as never);
}

export async function sendMessage(
  input: unknown
): Promise<{ id: string }> {
  const { body } = validateSend(input);
  const session = await requireSession();
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(chatMessage).values({
      id,
      workspaceId: session.workspaceId,
      userId: session.userId,
      body
    });
    await tx.insert(auditLog).values({
      id: randomUUID(),
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "CHAT_SEND",
      resourceType: "chat_message",
      resourceId: id,
      metadata: { bodyLength: body.length }
    });
  });
  await notify(`chat_ws_${session.workspaceId}`, {
    kind: "message",
    id
  });
  return { id };
}

export async function deleteMessage(
  input: unknown
): Promise<{ ok: true }> {
  const { messageId } = validateDelete(input);
  const session = await requireSession();
  const existing = await db
    .select({ userId: chatMessage.userId })
    .from(chatMessage)
    .where(eq(chatMessage.id, messageId))
    .limit(1);
  if (existing.length === 0) throw new Error("message-not-found");
  const isAuthor = existing[0]!.userId === session.userId;
  const isAdmin = session.permissions.includes("admin:all");
  if (!isAuthor && !isAdmin) throw new Error("forbidden");

  await db.transaction(async (tx) => {
    await tx
      .update(chatMessage)
      .set({ deletedAt: new Date() })
      .where(eq(chatMessage.id, messageId));
    await tx.insert(auditLog).values({
      id: randomUUID(),
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "CHAT_DELETE",
      resourceType: "chat_message",
      resourceId: messageId
    });
  });
  await notify(`chat_ws_${session.workspaceId}`, {
    kind: "delete",
    id: messageId
  });
  return { ok: true };
}

export async function toggleReaction(
  input: unknown
): Promise<{ action: "added" | "removed" }> {
  const { messageId, emoji } = validateToggle(input);
  const session = await requireSession();

  const msg = await db
    .select({ workspaceId: chatMessage.workspaceId })
    .from(chatMessage)
    .where(eq(chatMessage.id, messageId))
    .limit(1);
  if (msg.length === 0) throw new Error("message-not-found");
  if (msg[0]!.workspaceId !== session.workspaceId)
    throw new Error("forbidden");

  const existing = await db
    .select({ u: chatReaction.userId })
    .from(chatReaction)
    .where(
      and(
        eq(chatReaction.messageId, messageId),
        eq(chatReaction.userId, session.userId),
        eq(chatReaction.emoji, emoji as ChatReactionEmoji)
      )
    )
    .limit(1);

  let action: "added" | "removed";
  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      await tx
        .delete(chatReaction)
        .where(
          and(
            eq(chatReaction.messageId, messageId),
            eq(chatReaction.userId, session.userId),
            eq(chatReaction.emoji, emoji as ChatReactionEmoji)
          )
        );
      action = "removed";
    } else {
      await tx.insert(chatReaction).values({
        messageId,
        userId: session.userId,
        emoji
      });
      action = "added";
    }
    await tx.insert(auditLog).values({
      id: randomUUID(),
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: action === "added" ? "CHAT_REACT_ADD" : "CHAT_REACT_REMOVE",
      resourceType: "chat_message",
      resourceId: messageId,
      metadata: { emoji }
    });
  });
  await notify(`chat_ws_${session.workspaceId}`, {
    kind: "reaction",
    id: messageId
  });
  return { action: action! };
}
```

Note: if `db.execute` signature differs (Drizzle v0.30+), replace `notify` with:
```ts
await db.execute(sql`SELECT pg_notify(${channel}, ${json})`);
```
Check `packages/db/client.ts` first.

Also note: `session.permissions` — verify its presence in `requireSession` return via `packages/auth/session.ts`. If not present, adapt (use `session.roles` or `hasPermission(session, PERMISSIONS.ADMIN_ALL)`).

- [ ] **Step 4: Run test (passes)**

Run: `pnpm --filter @jarvis/web test actions/chat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/actions/chat.ts apps/web/app/actions/chat.test.ts
git commit -m "feat(chat): sendMessage / deleteMessage / toggleReaction server actions"
```

---

## Task 16: Leaves batch server action

**Files:**
- Create: `apps/web/app/(app)/contractors/leaves/actions.ts`
- Create: `apps/web/app/(app)/contractors/leaves/actions.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/app/(app)/contractors/leaves/actions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  leaveBatchInputSchema,
  validateBatchBusinessRules
} from "./actions.js";

describe("leaveBatchInputSchema", () => {
  it("accepts minimal batch", () => {
    const parsed = leaveBatchInputSchema.parse({
      contractId: "00000000-0000-0000-0000-000000000001",
      inserts: [],
      cancels: []
    });
    expect(parsed.inserts).toEqual([]);
  });
  it("rejects invalid type", () => {
    expect(() =>
      leaveBatchInputSchema.parse({
        contractId: "00000000-0000-0000-0000-000000000001",
        inserts: [
          {
            type: "weird",
            startDate: "2026-04-23",
            endDate: "2026-04-23",
            hours: 8
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
});

describe("validateBatchBusinessRules", () => {
  it("rejects start>end", () => {
    expect(() =>
      validateBatchBusinessRules({
        contractId: "c",
        inserts: [
          {
            type: "annual",
            startDate: "2026-04-25",
            endDate: "2026-04-20",
            hours: 8
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
  it("rejects hours <= 0", () => {
    expect(() =>
      validateBatchBusinessRules({
        contractId: "c",
        inserts: [
          {
            type: "annual",
            startDate: "2026-04-23",
            endDate: "2026-04-23",
            hours: 0
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run (fails)**

Run: `pnpm --filter @jarvis/web test contractors/leaves/actions`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/app/(app)/contractors/leaves/actions.ts`:
```ts
"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  contractorContract,
  leaveRequest,
  auditLog
} from "@jarvis/db/schema";
import { requirePermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const LEAVE_TYPES = ["annual", "halfAm", "halfPm", "sick", "family"] as const;

const insertSchema = z.object({
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive(),
  reason: z.string().max(500).optional().nullable()
});

export const leaveBatchInputSchema = z.object({
  contractId: z.string().uuid(),
  inserts: z.array(insertSchema),
  cancels: z.array(z.string().uuid())
});

export type LeaveBatchInput = z.infer<typeof leaveBatchInputSchema>;

export function validateBatchBusinessRules(input: LeaveBatchInput): void {
  for (const ins of input.inserts) {
    if (ins.startDate > ins.endDate)
      throw new Error("invalid-range");
    if (ins.hours <= 0) throw new Error("invalid-hours");
  }
}

export async function saveLeaveBatch(
  input: unknown
): Promise<{ inserted: string[]; cancelled: string[] }> {
  const parsed = leaveBatchInputSchema.parse(input);
  validateBatchBusinessRules(parsed);

  const session = await requirePermission(PERMISSIONS.CONTRACTOR_ADMIN);

  const contract = await db
    .select({
      id: contractorContract.id,
      workspaceId: contractorContract.workspaceId,
      userId: contractorContract.userId
    })
    .from(contractorContract)
    .where(eq(contractorContract.id, parsed.contractId))
    .limit(1);
  if (contract.length === 0) throw new Error("contract-not-found");
  if (contract[0]!.workspaceId !== session.workspaceId)
    throw new Error("forbidden");

  const inserted: string[] = [];
  const cancelled: string[] = [];

  await db.transaction(async (tx) => {
    for (const ins of parsed.inserts) {
      const id = randomUUID();
      await tx.insert(leaveRequest).values({
        id,
        workspaceId: session.workspaceId,
        userId: contract[0]!.userId,
        contractId: parsed.contractId,
        type: ins.type,
        startDate: ins.startDate,
        endDate: ins.endDate,
        hours: String(ins.hours),
        reason: ins.reason ?? null,
        status: "approved",
        createdBy: session.userId
      });
      await tx.insert(auditLog).values({
        id: randomUUID(),
        workspaceId: session.workspaceId,
        userId: session.userId,
        action: "LEAVE_INSERT",
        resourceType: "leave_request",
        resourceId: id,
        metadata: { contractId: parsed.contractId, type: ins.type }
      });
      inserted.push(id);
    }
    if (parsed.cancels.length > 0) {
      await tx
        .update(leaveRequest)
        .set({ cancelledAt: new Date() })
        .where(inArray(leaveRequest.id, parsed.cancels));
      for (const id of parsed.cancels) {
        await tx.insert(auditLog).values({
          id: randomUUID(),
          workspaceId: session.workspaceId,
          userId: session.userId,
          action: "LEAVE_CANCEL",
          resourceType: "leave_request",
          resourceId: id
        });
        cancelled.push(id);
      }
    }
  });

  return { inserted, cancelled };
}
```

- [ ] **Step 4: Run (passes)**

Run: `pnpm --filter @jarvis/web test contractors/leaves/actions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/actions.ts apps/web/app/\(app\)/contractors/leaves/actions.test.ts
git commit -m "feat(contractors): saveLeaveBatch transactional inserts + cancels"
```

---

## Task 17: Chat send/reactions REST fallback routes

**Files:**
- Create: `apps/web/app/api/chat/send/route.ts`
- Create: `apps/web/app/api/chat/reactions/route.ts`

- [ ] **Step 1: Implement send**

Create `apps/web/app/api/chat/send/route.ts`:
```ts
import { NextResponse } from "next/server";
import { sendMessage } from "@/app/actions/chat";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = await sendMessage(body);
    return NextResponse.json({ status: "ok", data: { id } });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "unknown"
      },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: Implement reactions**

Create `apps/web/app/api/chat/reactions/route.ts`:
```ts
import { NextResponse } from "next/server";
import { toggleReaction } from "@/app/actions/chat";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await toggleReaction(body);
    return NextResponse.json({ status: "ok", data: result });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "unknown"
      },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/chat/send/ apps/web/app/api/chat/reactions/
git commit -m "feat(chat): REST fallback routes for send + reactions"
```

---

## Task 18: Chat SSE stream route

**Files:**
- Create: `apps/web/app/api/chat/stream/route.ts`

- [ ] **Step 1: Implement**

Create `apps/web/app/api/chat/stream/route.ts`:
```ts
import { requireSession } from "@jarvis/auth/session";
import { getChatListenPool } from "@/lib/db/chat-listen-pool";
import {
  getMessageById,
  getReactionsForMessage
} from "@/lib/queries/chat";

export const dynamic = "force-dynamic";

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  const session = await requireSession();
  const channel = `chat_ws_${session.workspaceId.replace(/-/g, "_")}`;
  const viewerId = session.userId;

  const pool = getChatListenPool();
  const client = await pool.connect();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      await client.query(`LISTEN ${channel}`);
      push(sseFormat("ready", { ok: true }));

      const heartbeat = setInterval(() => push(`: keepalive\n\n`), 15_000);

      const onNotify = async (msg: {
        channel: string;
        payload?: string;
      }) => {
        if (msg.channel !== channel || !msg.payload) return;
        let parsed: { kind: string; id: string };
        try {
          parsed = JSON.parse(msg.payload);
        } catch {
          return;
        }
        if (parsed.kind === "message") {
          const row = await getMessageById(parsed.id);
          if (row) push(sseFormat("message", row));
        } else if (parsed.kind === "reaction") {
          const rx = await getReactionsForMessage(parsed.id, viewerId);
          push(sseFormat("reaction", { messageId: parsed.id, reactions: rx }));
        } else if (parsed.kind === "delete") {
          push(sseFormat("delete", { id: parsed.id }));
        }
      };
      client.on("notification", onNotify);

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        client.removeListener("notification", onNotify);
        try {
          await client.query(`UNLISTEN ${channel}`);
        } catch {
          /* ignore */
        }
        client.release();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener("abort", () => void cleanup());
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/chat/stream/
git commit -m "feat(chat): SSE stream via pg LISTEN/NOTIFY + heartbeat + cleanup"
```

---

## Task 19: Mascot + Hero + InfoCardRow subcomponents

**Files:**
- Create: `apps/web/public/mascot/capybara.svg`
- Create: `apps/web/app/(app)/dashboard/_components/HeroGreeting.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/DateCard.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/TimeCard.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/WeatherCard.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/FxCard.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/InfoCardRow.tsx`

- [ ] **Step 1: Capybara SVG**

Create `apps/web/public/mascot/capybara.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
  <ellipse cx="32" cy="42" rx="22" ry="14" fill="#b08664"/>
  <ellipse cx="32" cy="40" rx="20" ry="12" fill="#c49a7a"/>
  <circle cx="22" cy="28" r="10" fill="#b08664"/>
  <ellipse cx="22" cy="28" rx="8" ry="8" fill="#c49a7a"/>
  <circle cx="19" cy="26" r="1.2" fill="#2c1a0e"/>
  <circle cx="26" cy="26" r="1.2" fill="#2c1a0e"/>
  <ellipse cx="22" cy="31" rx="3" ry="1.6" fill="#8a5b3f"/>
  <circle cx="14" cy="22" r="2" fill="#b08664"/>
  <circle cx="30" cy="22" r="2" fill="#b08664"/>
  <rect x="10" y="50" width="4" height="8" fill="#8a5b3f" rx="1"/>
  <rect x="50" y="50" width="4" height="8" fill="#8a5b3f" rx="1"/>
</svg>
```

- [ ] **Step 2: HeroGreeting (server)**

Create `apps/web/app/(app)/dashboard/_components/HeroGreeting.tsx`:
```tsx
import Image from "next/image";
import { getTranslations } from "next-intl/server";

export async function HeroGreeting({ name }: { name: string }) {
  const t = await getTranslations("Dashboard");
  return (
    <div className="flex items-center gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-surface-900">
        {t("greeting", { name })}
      </h1>
      <Image
        src="/mascot/capybara.svg"
        alt=""
        width={40}
        height={40}
        priority
      />
    </div>
  );
}
```

- [ ] **Step 3: DateCard (server)**

Create `apps/web/app/(app)/dashboard/_components/DateCard.tsx`:
```tsx
import { getTranslations } from "next-intl/server";

export async function DateCard({ now }: { now: Date }) {
  const t = await getTranslations("Dashboard.info");
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-surface-200 bg-card p-4">
      <span className="text-xs font-medium text-surface-500">
        {t("todayLabel")}
      </span>
      <span className="text-lg font-semibold tabular-nums text-surface-900">
        {year}. {month}. {day} {weekday}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: TimeCard (client)**

Create `apps/web/app/(app)/dashboard/_components/TimeCard.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function TimeCard() {
  const t = useTranslations("Dashboard.info");
  const [text, setText] = useState("--:--:--");
  useEffect(() => {
    const update = () => {
      const fmt = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      setText(fmt.format(new Date()));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-surface-200 bg-card p-4"
      suppressHydrationWarning
    >
      <span className="text-xs font-medium text-surface-500">
        {t("timeLabel")}
      </span>
      <span className="text-lg font-semibold tabular-nums text-surface-900">
        {text}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: WeatherCard (client)**

Create `apps/web/app/(app)/dashboard/_components/WeatherCard.tsx`:
```tsx
"use client";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import type { WeatherSnapshot } from "@/lib/adapters/external/weather";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function WeatherCard() {
  const t = useTranslations("Dashboard.info");
  const { data } = useSWR<{
    status: "ok" | "error";
    data?: WeatherSnapshot;
  }>("/api/weather?region=seoul", fetcher, {
    refreshInterval: 600_000,
    revalidateOnFocus: true
  });
  const snap = data?.status === "ok" ? data.data : undefined;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-surface-200 bg-card p-4">
      <span className="text-xs font-medium text-surface-500">
        {snap
          ? `${snap.regionLabel} · ${snap.condition}`
          : t("weatherLabel")}
      </span>
      {snap ? (
        <>
          <span className="text-lg font-semibold text-surface-900">
            {snap.tempC}°
          </span>
          <span className="text-xs text-surface-500">
            {t("weatherHiLo", { hi: snap.hiC, lo: snap.loC })} ·{" "}
            {t("weatherParticulate", { level: snap.particulate })}
          </span>
        </>
      ) : (
        <span className="text-xs text-surface-400">—</span>
      )}
    </div>
  );
}
```

- [ ] **Step 6: FxCard (client)**

Create `apps/web/app/(app)/dashboard/_components/FxCard.tsx`:
```tsx
"use client";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import type { FxSnapshot } from "@/lib/adapters/external/fx";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function FxCard() {
  const t = useTranslations("Dashboard.info");
  const { data } = useSWR<{ status: "ok" | "error"; data?: FxSnapshot }>(
    "/api/fx",
    fetcher,
    {
      refreshInterval: 3_600_000,
      revalidateOnFocus: true
    }
  );
  const snap = data?.status === "ok" ? data.data : undefined;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-surface-200 bg-card p-4">
      <span className="text-xs font-medium text-surface-500">
        {t("fxLabel")}
      </span>
      {snap ? (
        <ul className="flex gap-4 text-sm tabular-nums">
          {snap.rates.map((r) => (
            <li key={r.code} className="flex flex-col">
              <span className="text-[11px] font-medium text-surface-500">
                {r.code}
                {r.basis === "100" ? " · 100" : ""}
              </span>
              <span className="text-lg font-semibold text-surface-900">
                {r.value.toLocaleString("ko-KR")}
              </span>
              <span
                className={
                  r.delta >= 0 ? "text-isu-600 text-xs" : "text-danger text-xs"
                }
              >
                {r.delta >= 0 ? "▲" : "▼"} {Math.abs(r.delta).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-surface-400">—</span>
      )}
    </div>
  );
}
```

- [ ] **Step 7: InfoCardRow composition**

Create `apps/web/app/(app)/dashboard/_components/InfoCardRow.tsx`:
```tsx
import { DateCard } from "./DateCard";
import { TimeCard } from "./TimeCard";
import { WeatherCard } from "./WeatherCard";
import { FxCard } from "./FxCard";

export async function InfoCardRow({ now }: { now: Date }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      <DateCard now={now} />
      <TimeCard />
      <WeatherCard />
      <FxCard />
    </div>
  );
}
```

- [ ] **Step 8: Run type-check**

Run: `pnpm --filter @jarvis/web type-check`
Expected: PASS (may fail until i18n keys added in Task 28 — document skip). Confirm non-i18n TS errors are zero.

- [ ] **Step 9: Commit**

```bash
git add apps/web/public/mascot/ apps/web/app/\(app\)/dashboard/_components/{HeroGreeting,DateCard,TimeCard,WeatherCard,FxCard,InfoCardRow}.tsx
git commit -m "feat(dashboard): hero greeting + info cards (date/time/weather/fx)"
```

---

## Task 20: Lounge chat components

**Files:**
- Create: `apps/web/app/(app)/dashboard/_components/ReactionPopover.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/ReactionChipRow.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/ChatComposer.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/ChatMessage.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/LoungeChat.tsx`

- [ ] **Step 1: ReactionPopover**

Create `apps/web/app/(app)/dashboard/_components/ReactionPopover.tsx`:
```tsx
"use client";
import { useTranslations } from "next-intl";
import {
  CHAT_REACTION_EMOJIS,
  type ChatReactionEmoji
} from "@jarvis/shared/constants/chat";

export function ReactionPopover({
  onPick
}: {
  onPick: (emoji: ChatReactionEmoji) => void;
}) {
  const t = useTranslations("Dashboard.lounge");
  return (
    <div
      role="menu"
      aria-label={t("addReaction")}
      className="flex gap-1 rounded-lg border border-surface-200 bg-card px-2 py-1 shadow-sm"
    >
      {CHAT_REACTION_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="rounded px-1.5 py-0.5 text-base hover:bg-surface-100"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: ReactionChipRow**

Create `apps/web/app/(app)/dashboard/_components/ReactionChipRow.tsx`:
```tsx
"use client";
import type { ReactionAggregate } from "@/lib/queries/chat";

export function ReactionChipRow({
  reactions,
  onToggle
}: {
  reactions: ReactionAggregate[];
  onToggle: (emoji: ReactionAggregate["emoji"]) => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          className={
            r.mine
              ? "inline-flex items-center gap-1 rounded-full border border-isu-300 bg-isu-50 px-2 py-0.5 text-xs text-isu-700"
              : "inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs text-surface-700"
          }
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: ChatComposer**

Create `apps/web/app/(app)/dashboard/_components/ChatComposer.tsx`:
```tsx
"use client";
import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { CHAT_MESSAGE_MAX_CHARS } from "@jarvis/shared/constants/chat";

export function ChatComposer({
  name,
  role,
  onSend
}: {
  name: string;
  role: string;
  onSend: (body: string) => Promise<void>;
}) {
  const t = useTranslations("Dashboard.lounge");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-surface-200 px-3 py-2">
      <textarea
        value={value}
        maxLength={CHAT_MESSAGE_MAX_CHARS}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("composerPlaceholder", { name, role })}
        rows={1}
        className="min-h-[36px] flex-1 resize-none rounded-md border border-surface-200 bg-card px-3 py-1.5 text-sm focus:border-isu-300 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={sending || value.trim().length === 0}
        className="rounded-md bg-isu-600 px-3 py-1.5 text-sm font-medium text-white disabled:bg-surface-300"
      >
        {t("send")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: ChatMessage**

Create `apps/web/app/(app)/dashboard/_components/ChatMessage.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChatMessageRow, ReactionAggregate } from "@/lib/queries/chat";
import type { ChatReactionEmoji } from "@jarvis/shared/constants/chat";
import { ReactionPopover } from "./ReactionPopover";
import { ReactionChipRow } from "./ReactionChipRow";

export function ChatMessage({
  msg,
  reactions,
  isMine,
  canDelete,
  onReact,
  onDelete
}: {
  msg: ChatMessageRow;
  reactions: ReactionAggregate[];
  isMine: boolean;
  canDelete: boolean;
  onReact: (emoji: ChatReactionEmoji) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Dashboard.lounge");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(msg.createdAt);
  const deleted = msg.deletedAt !== null;

  return (
    <li
      className="group relative flex gap-3 px-3 py-1.5 hover:bg-surface-50"
      onMouseLeave={() => setPopoverOpen(false)}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-surface-700">
        {msg.userName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-surface-800">
            {msg.userName}
          </span>
          <span className="text-xs tabular-nums text-surface-400">{time}</span>
        </div>
        <p
          className={
            deleted
              ? "text-sm italic text-surface-400"
              : "whitespace-pre-wrap break-words text-sm text-surface-800"
          }
        >
          {deleted ? t("deleted") : msg.body}
        </p>
        {!deleted && (
          <ReactionChipRow
            reactions={reactions}
            onToggle={(e) => onReact(e)}
          />
        )}
      </div>
      {!deleted && (
        <div className="absolute right-3 top-1 hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            className="rounded bg-card px-2 py-0.5 text-xs shadow-sm hover:bg-surface-100"
            aria-label={t("addReaction")}
          >
            ＋
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded bg-card px-2 py-0.5 text-xs text-surface-500 shadow-sm hover:bg-surface-100"
            >
              {t("delete")}
            </button>
          )}
        </div>
      )}
      {popoverOpen && (
        <div className="absolute right-3 top-8 z-10">
          <ReactionPopover
            onPick={(e) => {
              onReact(e);
              setPopoverOpen(false);
            }}
          />
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 5: LoungeChat**

Create `apps/web/app/(app)/dashboard/_components/LoungeChat.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import type { ChatMessageRow, ReactionAggregate } from "@/lib/queries/chat";
import type { ChatReactionEmoji } from "@jarvis/shared/constants/chat";
import { sendMessage, deleteMessage, toggleReaction } from "@/app/actions/chat";
import { ChatMessage } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";

type Message = ChatMessageRow & { reactions: ReactionAggregate[] };

export function LoungeChat({
  initial,
  viewerId,
  viewerName,
  viewerRole,
  isAdmin
}: {
  initial: Message[];
  viewerId: string;
  viewerName: string;
  viewerRole: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("Dashboard.lounge");
  const [messages, setMessages] = useState<Message[]>(initial);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: onlineData } = useSWR<{
    status: string;
    data: { count: number };
  }>("/api/chat/online", (u: string) => fetch(u).then((r) => r.json()), {
    refreshInterval: 30_000
  });
  const online = onlineData?.data?.count ?? 0;

  // SSE subscription
  useEffect(() => {
    const es = new EventSource("/api/chat/stream");
    es.addEventListener("message", (ev) => {
      const row = JSON.parse(ev.data) as ChatMessageRow;
      setMessages((prev) =>
        prev.some((m) => m.id === row.id)
          ? prev
          : [...prev, { ...row, reactions: [] }]
      );
    });
    es.addEventListener(
      "reaction",
      (ev) => {
        const { messageId, reactions } = JSON.parse(ev.data) as {
          messageId: string;
          reactions: ReactionAggregate[];
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
        );
      }
    );
    es.addEventListener("delete", (ev) => {
      const { id } = JSON.parse(ev.data) as { id: string };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, deletedAt: new Date() } : m
        )
      );
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function onSend(body: string) {
    await sendMessage({ body });
  }
  async function onReact(id: string, emoji: ChatReactionEmoji) {
    await toggleReaction({ messageId: id, emoji });
  }
  async function onDelete(id: string) {
    if (!confirm(t("delete") + "?")) return;
    await deleteMessage({ messageId: id });
  }

  return (
    <section className="flex h-[520px] flex-col rounded-xl border border-surface-200 bg-card">
      <header className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-surface-800">
            {t("title")}
          </div>
          <div className="text-xs text-surface-500">
            {t("subtitle", { online })}
          </div>
        </div>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-sm text-surface-500">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                msg={m}
                reactions={m.reactions}
                isMine={m.userId === viewerId}
                canDelete={m.userId === viewerId || isAdmin}
                onReact={(e) => void onReact(m.id, e)}
                onDelete={() => void onDelete(m.id)}
              />
            ))}
          </ul>
        )}
      </div>
      <ChatComposer name={viewerName} role={viewerRole} onSend={onSend} />
    </section>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/dashboard/_components/{ReactionPopover,ReactionChipRow,ChatComposer,ChatMessage,LoungeChat}.tsx
git commit -m "feat(dashboard): lounge chat components (optimistic + SSE + reactions)"
```

---

## Task 21: Right rail widgets

**Files:**
- Create: `apps/web/app/(app)/dashboard/_components/NoticesWidget.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/VacationsWidget.tsx`
- Create: `apps/web/app/(app)/dashboard/_components/LatestWikiWidget.tsx`

- [ ] **Step 1: NoticesWidget**

Create `apps/web/app/(app)/dashboard/_components/NoticesWidget.tsx`:
```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardNoticeRow } from "@/lib/queries/dashboard-notices";

function badgeFor(n: DashboardNoticeRow): { label: string; className: string } {
  if (n.pinned)
    return {
      label: "필독",
      className: "bg-danger-subtle text-danger border-danger/30"
    };
  return {
    label: n.sensitivity === "PUBLIC" ? "이벤트" : "공지",
    className:
      n.sensitivity === "PUBLIC"
        ? "bg-warning-subtle text-warning border-warning/30"
        : "bg-surface-100 text-surface-600 border-surface-200"
  };
}

function rel(d: Date, now: Date): string {
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export async function NoticesWidget({
  items,
  now
}: {
  items: DashboardNoticeRow[];
  now: Date;
}) {
  const t = await getTranslations("Dashboard.notices");
  return (
    <section className="rounded-xl border border-surface-200 bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-surface-800">{t("title")}</h2>
        <Link href="/notices" className="text-xs text-surface-500 hover:text-isu-600">
          {t("viewAll")} →
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const b = badgeFor(n);
            return (
              <li key={n.id} className="flex items-start gap-2">
                <span
                  className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${b.className}`}
                >
                  {n.pinned ? t("badgePinned") : n.sensitivity === "PUBLIC" ? t("badgeEvent") : t("badgeNotice")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-surface-800">{n.title}</div>
                  <div className="text-xs text-surface-500">
                    {n.authorName} · {n.publishedAt ? rel(n.publishedAt, now) : "—"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: VacationsWidget**

Create `apps/web/app/(app)/dashboard/_components/VacationsWidget.tsx`:
```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardVacationRow } from "@/lib/queries/dashboard-vacations";

const TYPE_KEY: Record<string, string> = {
  annual: "annual",
  halfAm: "halfAm",
  halfPm: "halfPm",
  sick: "sick",
  family: "family"
};

function typeLabel(
  t: (key: string) => string,
  type: string
): string {
  const k = TYPE_KEY[type] ?? "annual";
  return t(`types.${k}`);
}

function fmtRange(start: string, end: string): string {
  const s = start.slice(5).replace("-", "/");
  const e = end.slice(5).replace("-", "/");
  return s === e ? s : `${s}-${e}`;
}

function nextBusinessDay(end: string): {
  date: string;
  weekday: string;
} {
  const next = new Date(`${end}T00:00:00+09:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  while ([0, 6].includes(next.getUTCDay())) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short"
  }).format(next);
  return {
    date: `${next.getUTCMonth() + 1}/${next.getUTCDate()}`,
    weekday
  };
}

export async function VacationsWidget({
  items
}: {
  items: DashboardVacationRow[];
}) {
  const t = await getTranslations("Dashboard.vacations");
  return (
    <section className="rounded-xl border border-surface-200 bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-surface-800">{t("title")}</h2>
        <Link href="/contractors" className="text-xs text-surface-500 hover:text-isu-600">
          {t("count", { count: items.length })}
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((v) => {
            const ret = nextBusinessDay(v.endDate);
            return (
              <li key={v.id} className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-200 text-xs font-semibold text-surface-700">
                  {v.userName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-surface-800">
                    {v.userName}
                    {v.orgName ? (
                      <span className="ml-1 text-xs text-surface-500">· {v.orgName}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-surface-500">
                    {typeLabel(t, v.type)} · {fmtRange(v.startDate, v.endDate)}
                  </div>
                </div>
                <div className="shrink-0 text-xs tabular-nums text-surface-500">
                  {t("returnAt", { date: ret.date, weekday: ret.weekday })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: LatestWikiWidget**

Create `apps/web/app/(app)/dashboard/_components/LatestWikiWidget.tsx`:
```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardWikiRow } from "@/lib/queries/dashboard-wiki";

function rel(d: Date, now: Date): string {
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export async function LatestWikiWidget({
  items,
  workspaceId,
  now
}: {
  items: DashboardWikiRow[];
  workspaceId: string;
  now: Date;
}) {
  const t = await getTranslations("Dashboard.latestWiki");
  return (
    <section className="rounded-xl border border-surface-200 bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-surface-800">{t("title")}</h2>
        <Link href="/wiki" className="text-xs text-surface-500 hover:text-isu-600">
          {t("viewAll")} →
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((w) => (
            <li key={w.id} className="flex flex-col">
              <Link
                href={`/wiki/${workspaceId}/${w.path}`}
                className="truncate text-sm font-medium text-surface-800 hover:text-isu-600"
              >
                {w.title}
              </Link>
              <div className="flex items-center gap-1 text-xs text-surface-500">
                {w.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-surface-600"
                  >
                    {tag}
                  </span>
                ))}
                <span>
                  {w.authorName} · {rel(w.createdAt, now)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/dashboard/_components/{NoticesWidget,VacationsWidget,LatestWikiWidget}.tsx
git commit -m "feat(dashboard): right rail widgets (notices/vacations/latest-wiki)"
```

---

## Task 22: Dashboard page rewrite + legacy cleanup

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`
- Delete: `apps/web/app/(app)/dashboard/_components/{MyTasksWidget,QuickLinksWidget,RecentActivityWidget,SearchTrendsWidget,StalePagesWidget,StatCard,DashboardActivityList,DashboardQuickQuestions}.tsx`
- Delete: `apps/web/app/(app)/dashboard/_components/DashboardActivityList.test.tsx`
- Delete: `apps/web/app/(app)/dashboard/_components/DashboardQuickQuestions.test.tsx`
- Delete: `apps/web/app/(app)/dashboard/page.test.ts`
- Modify: `apps/web/lib/queries/dashboard.ts` (prune unused exports)

- [ ] **Step 1: Rewrite page**

Replace `apps/web/app/(app)/dashboard/page.tsx`:
```tsx
import { requirePageSession } from "@/lib/server/page-auth";
import { listDashboardNotices } from "@/lib/queries/dashboard-notices";
import { listWeekVacations } from "@/lib/queries/dashboard-vacations";
import { listLatestWikiPages } from "@/lib/queries/dashboard-wiki";
import { listRecentChatMessages } from "@/lib/queries/chat";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { HeroGreeting } from "./_components/HeroGreeting";
import { InfoCardRow } from "./_components/InfoCardRow";
import { LoungeChat } from "./_components/LoungeChat";
import { NoticesWidget } from "./_components/NoticesWidget";
import { VacationsWidget } from "./_components/VacationsWidget";
import { LatestWikiWidget } from "./_components/LatestWikiWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requirePageSession();
  const now = new Date();

  const [notices, vacations, latestWiki, chatInit] = await Promise.all([
    listDashboardNotices(session.workspaceId, 5, now),
    listWeekVacations(session.workspaceId, now, 10),
    listLatestWikiPages(session.workspaceId, session.permissions, 10),
    listRecentChatMessages(session.workspaceId, session.userId, 50)
  ]);

  const viewerRole = session.roles[0] ?? "—";
  const isAdmin = session.permissions.includes(PERMISSIONS.ADMIN_ALL);

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-4 p-6">
      <HeroGreeting name={session.name || "사용자"} />
      <InfoCardRow now={now} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <LoungeChat
          initial={chatInit}
          viewerId={session.userId}
          viewerName={session.name || "사용자"}
          viewerRole={viewerRole}
          isAdmin={isAdmin}
        />
        <div className="flex flex-col gap-4">
          <NoticesWidget items={notices} now={now} />
          <VacationsWidget items={vacations} />
          <LatestWikiWidget
            items={latestWiki}
            workspaceId={session.workspaceId}
            now={now}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete legacy widgets**

Run:
```bash
rm apps/web/app/\(app\)/dashboard/_components/MyTasksWidget.tsx
rm apps/web/app/\(app\)/dashboard/_components/QuickLinksWidget.tsx
rm apps/web/app/\(app\)/dashboard/_components/RecentActivityWidget.tsx
rm apps/web/app/\(app\)/dashboard/_components/SearchTrendsWidget.tsx
rm apps/web/app/\(app\)/dashboard/_components/StalePagesWidget.tsx
rm apps/web/app/\(app\)/dashboard/_components/StatCard.tsx
rm apps/web/app/\(app\)/dashboard/_components/DashboardActivityList.tsx
rm apps/web/app/\(app\)/dashboard/_components/DashboardActivityList.test.tsx
rm apps/web/app/\(app\)/dashboard/_components/DashboardQuickQuestions.tsx
rm apps/web/app/\(app\)/dashboard/_components/DashboardQuickQuestions.test.tsx
rm apps/web/app/\(app\)/dashboard/page.test.ts
```

- [ ] **Step 3: Prune unused queries/dashboard.ts exports**

```bash
grep -rn "from \"@/lib/queries/dashboard\"" apps/web/ packages/
```
For each export no longer referenced (`getMyTasks`, `getQuickLinks`, `getStalePages`, `getRecentActivity`, `getSearchTrends`, `getDashboardData`, `getSearchPeriodStart`, `isKnowledgePageStale`, `DashboardData`, `TaskSummary`, `StalePage`, `TrendItem`, `MenuItem`, `AuditLogEntry`, `DashboardLoaders`), remove it from `apps/web/lib/queries/dashboard.ts`. If the file becomes empty, remove the file entirely.

Keep any exports still referenced by non-dashboard code.

- [ ] **Step 4: Run type-check (will fail on missing i18n keys — OK for now)**

Run: `pnpm --filter @jarvis/web type-check`
Expected: If only i18n key errors remain, OK (Task 28 fixes). No other TS errors allowed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/dashboard/ apps/web/lib/queries/dashboard.ts
git commit -m "feat(dashboard): rewrite page + remove 5 legacy widgets"
```

---

## Task 23: Contractors layout + tab rename

**Files:**
- Modify: `apps/web/components/contractors/ContractorTabs.tsx`
- Modify: `apps/web/app/(app)/contractors/layout.tsx` (if exists; otherwise adapt)

- [ ] **Step 1: Inspect current layout**

Run: `cat apps/web/app/\(app\)/contractors/layout.tsx` — capture current structure.

- [ ] **Step 2: Update ContractorTabs**

Replace `apps/web/components/contractors/ContractorTabs.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function ContractorTabs() {
  const t = useTranslations("Contractors");
  const pathname = usePathname();
  const tabs = [
    { href: "/contractors", label: t("tabs.schedule") },
    { href: "/contractors/leaves", label: t("tabs.leaves") }
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--line)",
        marginBottom: 16
      }}
    >
      {tabs.map((tab) => {
        // /contractors or /contractors/schedule both activate "일정"
        const isSchedule =
          tab.href === "/contractors" &&
          (pathname === "/contractors" || pathname === "/contractors/schedule");
        const active = isSchedule || pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "8px 16px",
              borderBottom: active
                ? "2px solid var(--ink)"
                : "2px solid transparent",
              color: active ? "var(--ink)" : "var(--muted)",
              fontWeight: active ? 600 : 400,
              textDecoration: "none"
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contractors/ContractorTabs.tsx
git commit -m "feat(contractors): tab order schedule-first + rename to 휴가관리"
```

---

## Task 24: Contractors route swap (schedule as default)

**Files:**
- Modify: `apps/web/app/(app)/contractors/page.tsx`
- Modify: `apps/web/app/(app)/contractors/schedule/page.tsx`

- [ ] **Step 1: Move schedule logic to /contractors**

Replace `apps/web/app/(app)/contractors/page.tsx` with the full content of the current `schedule/page.tsx`:

```tsx
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listLeaveRequests } from "@/lib/queries/contractors";
import { listHolidays } from "@/lib/queries/holidays";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { ScheduleCalendar } from "@/components/contractors/ScheduleCalendar";
import { requirePageSession } from "@/lib/server/page-auth";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "외주인력 일정" };
export const dynamic = "force-dynamic";

export default async function ContractorsSchedulePage({
  searchParams
}: PageProps) {
  const session = await requirePageSession(
    PERMISSIONS.CONTRACTOR_READ,
    "/dashboard"
  );

  const sp = await searchParams;
  const now = new Date();
  const month =
    typeof sp?.month === "string" && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const userIdFilter = isAdmin ? undefined : session.userId;

  const [leaves, holidays, contractors] = await Promise.all([
    listLeaveRequests({
      workspaceId: session.workspaceId,
      userId: userIdFilter,
      from: firstDay,
      to: lastDay
    }),
    listHolidays({ workspaceId: session.workspaceId, year: y }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(
        and(
          eq(user.workspaceId, session.workspaceId),
          eq(user.employmentType, "contractor")
        )
      )
  ]);

  const userName = new Map(contractors.map((c) => [c.id, c.name]));
  const enrichedLeaves = leaves.map((l) => ({
    ...l,
    userName: userName.get(l.userId) ?? "?",
    timeFrom: l.timeFrom?.toISOString() ?? null,
    timeTo: l.timeTo?.toISOString() ?? null,
    cancelledAt: l.cancelledAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString()
  }));

  const calendarLeaves = enrichedLeaves.map((l) => ({
    id: l.id,
    userId: l.userId,
    userName: l.userName,
    type: l.type,
    startDate: l.startDate,
    endDate: l.endDate,
    hours: l.hours,
    reason: l.reason ?? null
  }));

  return (
    <ScheduleCalendar
      month={month}
      leaves={calendarLeaves}
      holidays={holidays.map((h) => ({ date: h.date, name: h.name }))}
      currentUserId={session.userId}
      isAdmin={isAdmin}
    />
  );
}
```

- [ ] **Step 2: Keep /contractors/schedule rendering same page (bookmark preservation)**

Replace `apps/web/app/(app)/contractors/schedule/page.tsx`:
```tsx
export { default } from "../page";
export { metadata, dynamic } from "../page";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/contractors/page.tsx apps/web/app/\(app\)/contractors/schedule/page.tsx
git commit -m "feat(contractors): /contractors now renders schedule calendar (tab default)"
```

---

## Task 25: Leaves management panel (master-detail)

**Files:**
- Create: `apps/web/app/(app)/contractors/leaves/page.tsx`
- Create: `apps/web/components/contractors/LeaveManagementPanel.tsx`
- Create: `apps/web/components/contractors/LeaveMasterTable.tsx`
- Create: `apps/web/components/contractors/LeaveDetailTable.tsx`

- [ ] **Step 1: Page**

Create `apps/web/app/(app)/contractors/leaves/page.tsx`:
```tsx
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requirePageSession } from "@/lib/server/page-auth";
import { listLeaveSummary } from "@/lib/queries/contractors";
import { LeaveManagementPanel } from "@/components/contractors/LeaveManagementPanel";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "휴가관리" };
export const dynamic = "force-dynamic";

export default async function ContractorsLeavesPage({
  searchParams
}: PageProps) {
  const session = await requirePageSession(
    PERMISSIONS.CONTRACTOR_READ,
    "/dashboard"
  );

  const sp = await searchParams;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const referenceDate =
    typeof sp?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : todayStr;
  const nameLike = typeof sp?.name === "string" ? sp.name : "";

  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const rows = await listLeaveSummary({
    workspaceId: session.workspaceId,
    referenceDate,
    nameLike: nameLike || undefined,
    currentUserId: isAdmin ? undefined : session.userId
  });

  return (
    <LeaveManagementPanel
      initialSummary={rows}
      initialQuery={{ referenceDate, name: nameLike }}
      isAdmin={isAdmin}
    />
  );
}
```

- [ ] **Step 2: LeaveMasterTable**

Create `apps/web/components/contractors/LeaveMasterTable.tsx`:
```tsx
"use client";
import { useTranslations } from "next-intl";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";

export function LeaveMasterTable({
  rows,
  selectedId,
  onSelect
}: {
  rows: LeaveSummaryRow[];
  selectedId: string | null;
  onSelect: (contractId: string) => void;
}) {
  const t = useTranslations("Contractors.leaves.master.columns");
  return (
    <div className="overflow-x-auto rounded-md border border-surface-200">
      <table className="w-full text-xs">
        <thead className="bg-surface-50 text-surface-600">
          <tr>
            <th className="px-2 py-1 text-right">{t("no")}</th>
            <th className="px-2 py-1 text-left">{t("employeeId")}</th>
            <th className="px-2 py-1 text-left">{t("name")}</th>
            <th className="px-2 py-1 text-left">{t("contractStart")}</th>
            <th className="px-2 py-1 text-left">{t("contractEnd")}</th>
            <th className="px-2 py-1 text-right">{t("generated")}</th>
            <th className="px-2 py-1 text-right">{t("used")}</th>
            <th className="px-2 py-1 text-right">{t("remaining")}</th>
            <th className="px-2 py-1 text-left">{t("note")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const selected = r.contractId === selectedId;
            return (
              <tr
                key={r.contractId}
                onClick={() => onSelect(r.contractId)}
                className={
                  selected
                    ? "cursor-pointer bg-isu-50"
                    : "cursor-pointer hover:bg-surface-50"
                }
              >
                <td className="px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                <td className="px-2 py-1">{r.employeeId}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1 tabular-nums">{r.contractStartDate}</td>
                <td className="px-2 py-1 tabular-nums">{r.contractEndDate}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.generatedDays.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.usedDays.toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {r.remainingDays.toFixed(2)}
                </td>
                <td className="max-w-[240px] truncate px-2 py-1 text-surface-600">
                  {r.note ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: LeaveDetailTable**

Create `apps/web/components/contractors/LeaveDetailTable.tsx`:
```tsx
"use client";
import { useTranslations } from "next-intl";

export interface DetailRow {
  id: string;              // existing row id or `_tmp_<n>`
  status: "active" | "cancelled";
  type: string;            // annual/halfAm/...
  appliedAt: string | null;// iso or null for new rows
  requestStatus: string;   // approved/pending/rejected
  startDate: string;
  endDate: string;
  hours: number;
  reason: string | null;
  dirty: boolean;          // true for new/edited rows
  markedForCancel: boolean;
}

export function LeaveDetailTable({
  rows,
  disabled,
  onAdd,
  onSave,
  onRowChange,
  onToggleCancel
}: {
  rows: DetailRow[];
  disabled: boolean;
  onAdd: () => void;
  onSave: () => void;
  onRowChange: (id: string, patch: Partial<DetailRow>) => void;
  onToggleCancel: (id: string, next: boolean) => void;
}) {
  const t = useTranslations("Contractors.leaves.detail");
  const anyDirty = rows.some((r) => r.dirty || r.markedForCancel);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="rounded border border-surface-300 bg-card px-3 py-1 text-xs disabled:opacity-50"
        >
          {t("actions.add")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || !anyDirty}
          className="rounded bg-isu-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {t("actions.save")}
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-surface-200">
        <table className="w-full text-xs">
          <thead className="bg-surface-50 text-surface-600">
            <tr>
              <th className="px-2 py-1 text-right">{t("columns.no")}</th>
              <th className="px-2 py-1">{t("columns.delete")}</th>
              <th className="px-2 py-1">{t("columns.status")}</th>
              <th className="px-2 py-1">{t("columns.type")}</th>
              <th className="px-2 py-1">{t("columns.appliedAt")}</th>
              <th className="px-2 py-1">{t("columns.requestStatus")}</th>
              <th className="px-2 py-1">{t("columns.startDate")}</th>
              <th className="px-2 py-1">{t("columns.endDate")}</th>
              <th className="px-2 py-1 text-right">{t("columns.days")}</th>
              <th className="px-2 py-1">{t("columns.reason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isNew = r.id.startsWith("_tmp_");
              const rowClass = r.markedForCancel
                ? "bg-danger-subtle/40"
                : r.dirty
                  ? "bg-warning-subtle/40"
                  : "";
              return (
                <tr key={r.id} className={rowClass}>
                  <td className="px-2 py-1 text-right tabular-nums">{idx + 1}</td>
                  <td className="px-2 py-1 text-center">
                    {!isNew && (
                      <input
                        type="checkbox"
                        checked={r.markedForCancel}
                        disabled={disabled}
                        onChange={(e) => onToggleCancel(r.id, e.target.checked)}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1">{r.status}</td>
                  <td className="px-2 py-1">
                    {isNew ? (
                      <select
                        value={r.type}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, { type: e.target.value })
                        }
                        className="rounded border px-1"
                      >
                        <option value="annual">annual</option>
                        <option value="halfAm">halfAm</option>
                        <option value="halfPm">halfPm</option>
                        <option value="sick">sick</option>
                        <option value="family">family</option>
                      </select>
                    ) : (
                      r.type
                    )}
                  </td>
                  <td className="px-2 py-1 tabular-nums">
                    {r.appliedAt?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="px-2 py-1">{r.requestStatus}</td>
                  <td className="px-2 py-1 tabular-nums">
                    {isNew ? (
                      <input
                        type="date"
                        value={r.startDate}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, { startDate: e.target.value })
                        }
                        className="rounded border px-1"
                      />
                    ) : (
                      r.startDate
                    )}
                  </td>
                  <td className="px-2 py-1 tabular-nums">
                    {isNew ? (
                      <input
                        type="date"
                        value={r.endDate}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, { endDate: e.target.value })
                        }
                        className="rounded border px-1"
                      />
                    ) : (
                      r.endDate
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {isNew ? (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={r.hours}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, {
                            hours: Number(e.target.value)
                          })
                        }
                        className="w-16 rounded border px-1 text-right"
                      />
                    ) : (
                      (r.hours / 8).toFixed(2)
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {isNew ? (
                      <input
                        type="text"
                        value={r.reason ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          onRowChange(r.id, { reason: e.target.value })
                        }
                        className="w-full rounded border px-1"
                      />
                    ) : (
                      r.reason ?? ""
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: LeaveManagementPanel**

Create `apps/web/components/contractors/LeaveManagementPanel.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";
import { LeaveMasterTable } from "./LeaveMasterTable";
import { LeaveDetailTable, type DetailRow } from "./LeaveDetailTable";
import { saveLeaveBatch } from "@/app/(app)/contractors/leaves/actions";

type Query = { referenceDate: string; name: string };

export function LeaveManagementPanel({
  initialSummary,
  initialQuery,
  isAdmin
}: {
  initialSummary: LeaveSummaryRow[];
  initialQuery: Query;
  isAdmin: boolean;
}) {
  const t = useTranslations("Contractors.leaves");
  const router = useRouter();
  const [query, setQuery] = useState<Query>(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSummary[0]?.contractId ?? null
  );
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [tmpCounter, setTmpCounter] = useState(0);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => initialSummary.find((r) => r.contractId === selectedId) ?? null,
    [initialSummary, selectedId]
  );

  function runSearch() {
    const qs = new URLSearchParams();
    qs.set("date", query.referenceDate);
    if (query.name.trim()) qs.set("name", query.name.trim());
    router.push(`/contractors/leaves?${qs.toString()}`);
  }

  function addRow() {
    if (!selected) return;
    const id = `_tmp_${tmpCounter}`;
    setTmpCounter((n) => n + 1);
    setDetailRows((prev) => [
      ...prev,
      {
        id,
        status: "active",
        type: "annual",
        appliedAt: null,
        requestStatus: "approved",
        startDate: query.referenceDate,
        endDate: query.referenceDate,
        hours: 8,
        reason: "",
        dirty: true,
        markedForCancel: false
      }
    ]);
  }

  function onRowChange(id: string, patch: Partial<DetailRow>) {
    setDetailRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r))
    );
  }

  function onToggleCancel(id: string, next: boolean) {
    setDetailRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, markedForCancel: next } : r))
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const inserts = detailRows
        .filter((r) => r.id.startsWith("_tmp_") && !r.markedForCancel)
        .map((r) => ({
          type: r.type,
          startDate: r.startDate,
          endDate: r.endDate,
          hours: r.hours,
          reason: r.reason
        }));
      const cancels = detailRows
        .filter((r) => !r.id.startsWith("_tmp_") && r.markedForCancel)
        .map((r) => r.id);
      await saveLeaveBatch({
        contractId: selected.contractId,
        inserts,
        cancels
      });
      setDetailRows([]);
      router.refresh();
    } catch (err) {
      alert(t("detail.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <label className="text-xs text-surface-600">
          {t("search.referenceDate")}
        </label>
        <input
          type="date"
          value={query.referenceDate}
          onChange={(e) =>
            setQuery((q) => ({ ...q, referenceDate: e.target.value }))
          }
          className="rounded border border-surface-300 px-2 py-1 text-xs"
        />
        <label className="ml-2 text-xs text-surface-600">
          {t("search.name")}
        </label>
        <input
          type="text"
          value={query.name}
          onChange={(e) => setQuery((q) => ({ ...q, name: e.target.value }))}
          className="rounded border border-surface-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={runSearch}
          className="rounded bg-isu-600 px-3 py-1 text-xs font-medium text-white"
        >
          {t("search.submit")}
        </button>
      </header>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-surface-700">
          ▶ {t("master.columns.name")}
        </h3>
        <LeaveMasterTable
          rows={initialSummary}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setDetailRows([]);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-surface-700">
          ▶ {t("detail.columns.reason")}
        </h3>
        <LeaveDetailTable
          rows={detailRows}
          disabled={!isAdmin || saving || !selected}
          onAdd={addRow}
          onSave={() => void save()}
          onRowChange={onRowChange}
          onToggleCancel={onToggleCancel}
        />
      </div>
    </section>
  );
}
```

Note: `detailRows` is initialized as empty when a user first loads the page. If the spec wants existing leave_request rows pre-populated in the Detail table, extend `listLeaveSummary` to also return per-contract leaveRequest rows, and pass them as prop. For Phase 1, keep the empty-then-add flow — simpler and matches the "입력 → 저장" UX. Document this explicitly in the task.

- [ ] **Step 5: Delete legacy components**

```bash
rm apps/web/components/contractors/NewContractorModal.tsx
rm apps/web/components/contractors/ContractorTable.tsx
rm apps/web/components/contractors/ContractorDrawer.tsx
rm apps/web/components/contractors/LeaveAddModal.tsx
rm apps/web/components/contractors/LeavePopover.tsx
```

(Check that `LeavePopover` is not referenced by `ScheduleCalendar`. If it is, keep it — remove only unused ones. Run `grep -rn "LeavePopover" apps/web/` first.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/ apps/web/components/contractors/
git commit -m "feat(contractors): master-detail leave management + remove legacy modals"
```

---

## Task 26: i18n batch update

**Files:**
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 1: Prune removed keys**

Open `apps/web/messages/ko.json`, locate `Dashboard` namespace (line ~275). Replace the entire `Dashboard` object with the new structure (Sections 7 of spec). Replace `Contractors.tabs` and add `Contractors.leaves`.

Specifically, replace the whole `"Dashboard": { ... }` block with:

```json
"Dashboard": {
  "greeting": "안녕하세요, {name}님",
  "info": {
    "todayLabel": "오늘",
    "timeLabel": "현재 시각",
    "weatherLabel": "서울 · 맑음",
    "weatherHiLo": "H {hi}° / L {lo}°",
    "weatherParticulate": "미세먼지 {level}",
    "fxLabel": "환율 · KRW 기준",
    "source": { "weather": "기상청", "fx": "수출입은행" }
  },
  "lounge": {
    "title": "전사 라운지",
    "subtitle": "{online}명 온라인 · 자유 채팅",
    "composerPlaceholder": "{name} · {role} — 메시지 입력…",
    "send": "전송",
    "delete": "삭제",
    "deleted": "삭제된 메시지입니다",
    "addReaction": "리액션 추가",
    "empty": "아직 메시지가 없습니다. 첫 메시지를 남겨보세요."
  },
  "notices": {
    "title": "사내 공지",
    "viewAll": "전체",
    "badgePinned": "필독",
    "badgeNotice": "공지",
    "badgeEvent": "이벤트",
    "empty": "게시된 공지가 없습니다."
  },
  "vacations": {
    "title": "금주 휴가",
    "count": "{count}명",
    "returnAt": "{date} ({weekday})",
    "types": {
      "annual": "연차",
      "halfAm": "반차-오전",
      "halfPm": "반차-오후",
      "sick": "질병",
      "family": "경조사"
    },
    "empty": "이번 주 휴가자가 없습니다."
  },
  "latestWiki": {
    "title": "최신 위키",
    "viewAll": "전체",
    "empty": "최근 게시된 페이지가 없습니다."
  }
}
```

- [ ] **Step 2: Update Contractors namespace**

Locate `"Contractors"` block; replace `tabs` and add `leaves`:

```json
"Contractors": {
  "tabs": {
    "schedule": "일정",
    "leaves": "휴가관리"
  },
  "leaves": {
    "title": "휴가관리",
    "search": {
      "referenceDate": "기준일자",
      "name": "성명",
      "submit": "조회"
    },
    "master": {
      "columns": {
        "no": "No",
        "employeeId": "사번",
        "name": "성명",
        "contractStart": "계약시작일",
        "contractEnd": "계약종료일",
        "generated": "발행일수",
        "used": "사용일수",
        "remaining": "잔여일수",
        "note": "비고"
      }
    },
    "detail": {
      "columns": {
        "no": "No",
        "delete": "삭제",
        "status": "상태",
        "type": "근태명",
        "appliedAt": "신청일",
        "requestStatus": "신청상태",
        "startDate": "적용시작일",
        "endDate": "적용종료일",
        "days": "적용일수",
        "reason": "사유"
      },
      "actions": {
        "add": "입력",
        "save": "저장"
      },
      "toast": {
        "saved": "저장되었습니다",
        "saveFailed": "저장 실패"
      }
    }
  /* keep any other pre-existing Contractors subsections (e.g. roster removal if present) */
  }
}
```

Preserve any existing `Contractors.*` subkeys unrelated to roster UI (e.g. `table` columns used by ScheduleCalendar). Remove keys that were strictly for `NewContractorModal` / `ContractorTable` / `LeaveAddModal` / `ContractorDrawer` if present.

- [ ] **Step 3: Verify JSON syntactically valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/ko.json','utf8'))"`
Expected: no error.

- [ ] **Step 4: Type-check full**

Run: `pnpm --filter @jarvis/web type-check`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm --filter @jarvis/web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/messages/ko.json
git commit -m "i18n(ko): dashboard redesign + lounge + vacations + leaves keys"
```

---

## Task 27: Integration test — weather/fx cache

**Files:**
- Create: `apps/web/app/api/weather/route.integration.test.ts`

- [ ] **Step 1: Write test**

Create `apps/web/app/api/weather/route.integration.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("/api/weather caching", () => {
  it("second call within TTL returns identical fetchedAt", async () => {
    const res1 = await GET(new Request("http://x/api/weather?region=seoul"));
    const body1 = await res1.json();
    const res2 = await GET(new Request("http://x/api/weather?region=seoul"));
    const body2 = await res2.json();
    expect(body1.data.fetchedAt).toBe(body2.data.fetchedAt);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @jarvis/web test app/api/weather/route.integration`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/weather/route.integration.test.ts
git commit -m "test(api): weather cache TTL integration"
```

---

## Task 28: E2E — dashboard renders

**Files:**
- Create: `apps/web/e2e/dashboard-redesign.spec.ts`

- [ ] **Step 1: Write E2E**

Create `apps/web/e2e/dashboard-redesign.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test.describe("Dashboard redesign", () => {
  test("renders hero + 4 info cards + 3 right widgets", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/이메일/).fill("admin@jarvis.test");
    await page.getByLabel(/비밀번호/).fill("password");
    await page.getByRole("button", { name: /로그인|Sign in/i }).click();
    await page.waitForURL("**/dashboard");

    await expect(page.getByRole("heading", { name: /안녕하세요/ })).toBeVisible();
    await expect(page.locator('img[alt=""][src*="capybara"]')).toBeVisible();
    await expect(page.getByText(/오늘/)).toBeVisible();
    await expect(page.getByText(/현재 시각/)).toBeVisible();
    await expect(page.getByText(/서울/)).toBeVisible();
    await expect(page.getByText(/환율/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "전사 라운지" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "사내 공지" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "금주 휴가" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "최신 위키" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/dashboard-redesign.spec.ts
git commit -m "test(e2e): dashboard redesign layout smoke"
```

---

## Task 29: E2E — contractors tab order + leaves flow

**Files:**
- Create: `apps/web/e2e/contractors-leaves.spec.ts`

- [ ] **Step 1: Write E2E**

Create `apps/web/e2e/contractors-leaves.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test.describe("Contractors tabs & leaves", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/이메일/).fill("admin@jarvis.test");
    await page.getByLabel(/비밀번호/).fill("password");
    await page.getByRole("button", { name: /로그인|Sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("tab order: 일정 first, 휴가관리 second", async ({ page }) => {
    await page.goto("/contractors");
    const tabs = page.getByRole("link").filter({ hasText: /일정|휴가관리/ });
    const first = await tabs.nth(0).textContent();
    const second = await tabs.nth(1).textContent();
    expect(first).toContain("일정");
    expect(second).toContain("휴가관리");
  });

  test("/contractors renders schedule calendar", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByText(/월|달력/).first()).toBeVisible();
  });

  test("/contractors/schedule still works", async ({ page }) => {
    await page.goto("/contractors/schedule");
    await expect(page).toHaveURL(/\/contractors\/schedule/);
  });

  test("/contractors/leaves renders search bar + master table", async ({
    page
  }) => {
    await page.goto("/contractors/leaves");
    await expect(page.getByText("기준일자")).toBeVisible();
    await expect(page.getByRole("button", { name: "조회" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/contractors-leaves.spec.ts
git commit -m "test(e2e): contractors tabs + leaves page"
```

---

## Task 30: Final verification gates

**Files:** (no file changes — verification only)

- [ ] **Step 1: Type-check**

Run: `pnpm --filter @jarvis/web type-check`
Expected: PASS (0 errors).

- [ ] **Step 2: Lint**

Run: `pnpm --filter @jarvis/web lint`
Expected: PASS.

- [ ] **Step 3: Unit + integration tests**

Run: `pnpm --filter @jarvis/web test`
Expected: all PASS. Pay special attention to chat, dashboard queries, contractors.

- [ ] **Step 4: Schema drift**

Run: `pnpm db:generate`
Expected: no new files (already generated in Task 1).

Run: `node scripts/check-schema-drift.mjs --precommit`
Expected: exit 0.

- [ ] **Step 5: RSC boundary audit**

Run: `pnpm audit:rsc`
Expected: PASS. If fails, inspect any `use server`/`use client` boundary issues in new components.

- [ ] **Step 6: Playwright E2E (PR 직전)**

Run:
```bash
pnpm --filter @jarvis/web exec playwright test dashboard-redesign contractors-leaves
```
Expected: all PASS. If flakey on SSE, document and retry 2x.

- [ ] **Step 7: Manual smoke — dev server**

Run: `pnpm dev`
Navigate to `http://localhost:3010/dashboard`. Verify:
- Greeting text + capybara svg renders
- 4 info cards show values (date/time/weather mock/fx mock)
- Lounge chat: send a message, see it appear, open reaction popover, click 👍, see chip +1
- Notices/Vacations/Latest wiki widgets render (empty states OK if no seed data)
- `/contractors` = schedule calendar
- `/contractors/leaves` = search bar + master table + detail empty state

- [ ] **Step 8: Final commit**

```bash
git status
# ensure clean; if any stray files, address them
```

---

## Post-Plan Self-Review Checklist

Complete after all tasks are executed:

**Spec coverage**
- [ ] §4.1 Dashboard RSC composition → Task 22
- [ ] §4.2 External adapters → Tasks 4, 5
- [ ] §4.3 Chat domain (schema/actions/SSE) → Tasks 1, 2, 9, 11, 14, 15, 17, 18
- [ ] §4.4 Right rail widgets → Tasks 6, 7, 8, 21
- [ ] §4.5 Hero + info cards → Task 19
- [ ] §4.6 Contractors refactor → Tasks 10, 16, 23, 24, 25
- [ ] §4.7 Directory structure → Tasks 19–25 together
- [ ] §5 Data model → Task 1
- [ ] §6 Permissions → no-op (reuses existing)
- [ ] §7 i18n → Task 26
- [ ] §8 External API strategy → Tasks 4, 5, 12, 13
- [ ] §9 Chat details (Pool, online count) → Tasks 11, 14, 9
- [ ] §10 Testing → Tasks 6–10, 12–17, 27–29
- [ ] §11 Risks: addressed by code (pool split, check constraint, fail-soft 200s, transaction)
- [ ] §12 Migration + env → Tasks 1, 3
- [ ] §13 File change order → Tasks arranged in spec §13 order
- [ ] §14 Out-of-scope → not in plan (by design)

**Type consistency**
- [ ] `ChatReactionEmoji` consistent across shared/constants, validation, queries, actions, UI
- [ ] `DashboardVacationRow.type` is plain string ("annual"/…); i18n key lookup in `VacationsWidget` matches
- [ ] `LeaveSummaryRow` field names same in query, page, panel, tables
- [ ] `DetailRow.id` prefix `_tmp_` consistent in add/save logic

**Placeholder scan**
- [ ] No TBD/TODO remaining
- [ ] Every code step has actual code
- [ ] Every `Run:` step has expected output

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-dashboard-redesign.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — task-by-task with fresh subagent per task + spec-reviewer + code-quality-reviewer between tasks. Best for this size plan.
2. **Inline Execution** — batch-execute tasks with checkpoints. Faster but less review.

**Which approach?**
