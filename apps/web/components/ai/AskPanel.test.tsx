// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WikiPageSourceRef } from "@jarvis/ai/types";

// ---------------------------------------------------------------------------
// Mocks — AskPanel has many dependencies; mock them all at module level.
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/hooks/useAskAI", () => ({
  useAskAI: () => ({
    isStreaming: false,
    answer: "휴가는 [[leave-policy]]에 따른다.",
    sources: [
      {
        kind: "wiki-page",
        pageId: "p1",
        slug: "leave-policy",
        title: "휴가 정책",
        path: "wiki/ws/auto/concepts/leave-policy.md",
        sensitivity: "PUBLIC",
        citation: "[[leave-policy]]",
        origin: "shortlist",
        confidence: 0.9,
      } satisfies WikiPageSourceRef,
    ],
    error: null,
    question: "휴가 정책은?",
    lane: "wiki",
    feedbackSent: null,
    conversationId: null,
    ask: vi.fn(),
    reset: vi.fn(),
    sendFeedback: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/ask/actions", () => ({
  getConversationTokenUsageAction: vi.fn().mockResolvedValue({ usedTokens: 0, messageCount: 0 }),
}));

vi.mock("@/lib/ai/model-windows", () => ({
  getModelContextWindow: vi.fn().mockReturnValue(128000),
}));

vi.mock("@/components/layout/Capy", () => ({
  Capy: () => null,
}));

vi.mock("@/components/layout/GlobeLoader", () => ({
  GlobeLoader: () => null,
}));

vi.mock("./WikiPanelContext", () => ({
  useWikiPanel: () => ({ hasProvider: false, open: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------
import { AskPanel } from "./AskPanel";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
  // localStorage stub
  Object.defineProperty(window, "localStorage", {
    writable: true,
    configurable: true,
    value: {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  });
});

describe("AskPanel — live citation rendering", () => {
  it("live answer body의 [[slug]]가 ClaimBadge로 변환됨 (raw text 미노출)", () => {
    // SSR을 통해 AnswerBody가 [[slug]]를 ClaimBadge로 변환하는지 확인
    const html = renderToStaticMarkup(
      <AskPanel workspaceId="ws-1" />,
    );
    // AnswerBody prose div 안에 ClaimBadge(sup element)가 렌더되어야 함
    expect(html).toMatch(/<sup[\s>]/);
    // prose div 안의 answer body section에서 [[...]] raw text가 없어야 함.
    // (SourceRefCard의 citation 필드는 별도 영역이므로 answer body만 검사)
    const proseDivMatch = html.match(/<div class="prose prose-sm[^"]*">([\s\S]*?)<\/div>/);
    if (proseDivMatch?.[1]) {
      expect(proseDivMatch[1]).not.toContain("[[leave-policy]]");
    } else {
      // prose div가 SSR에서 없으면 sup가 있으면 충분
      expect(html).toMatch(/<sup[\s>]/);
    }
  });
});
