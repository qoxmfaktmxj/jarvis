import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  askAgentStream: vi.fn(),
  appendAssistantMessage: vi.fn(),
  appendUserMessage: vi.fn(),
  createConversation: vi.fn(),
}));

vi.mock("@jarvis/ai", () => ({ askAgentStream: mocks.askAgentStream }));
vi.mock("@/lib/server/api-auth", () => ({
  withApiPermission: (
    _permission: unknown,
    handler: (request: Request, session: Record<string, unknown>) => Promise<Response>,
  ) =>
    (request: Request) => handler(request, {
      workspaceId: "550e8400-e29b-41d4-a716-446655440001",
      userId: "550e8400-e29b-41d4-a716-446655440002",
      accountType: "human",
      permissions: [],
    }),
}));
vi.mock("@/lib/server/ask-agent-deps", () => ({ createAskAgentDeps: () => ({}) }));
vi.mock("@/lib/server/conversation-repository", () => ({
  appendAssistantMessage: mocks.appendAssistantMessage,
  appendUserMessage: mocks.appendUserMessage,
  createConversation: mocks.createConversation,
  enrichSourceCitation: vi.fn(),
  loadOwnedConversation: vi.fn(),
}));

describe("POST /api/ask", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.appendAssistantMessage.mockReset().mockResolvedValue(undefined);
    mocks.appendUserMessage.mockReset().mockResolvedValue(undefined);
    mocks.createConversation.mockReset().mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440003",
    });
    mocks.askAgentStream.mockReset().mockImplementation(() => (async function* () {
      throw new Error("provider failed");
    })());
  });

  it("includes the error type in the SSE payload", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "식대 비과세 한도는?" }),
    }), undefined as never);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      'data: {"type":"error","errorCode":"ASK_STREAM_FAILED"}',
    );
  });
});
