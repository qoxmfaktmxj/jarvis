import type { Permission } from "@jarvis/shared";
import type { EvidenceSearchHit, createEvidenceSearcher } from "@jarvis/search";
import type { ImmutableObjectStore } from "@jarvis/storage";
import type { GitRepo } from "@jarvis/wiki-fs";

export type { EvidenceSearchHit } from "@jarvis/search";

export interface AskInput {
  conversationId: string;
  question: string;
  asOf?: string;
}

export interface ToolContext {
  workspaceId: string;
  userId: string;
  accountType: "human" | "demo";
  permissions: ReadonlySet<Permission>;
}

export const TOOL_NAMES = [
  "wiki_search",
  "wiki_read",
  "source_read",
  "wiki_follow_link",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface SourceRevisionRecord {
  id: string;
  workspaceId: string;
  sourceDocumentId: string;
  title: string;
  canonicalUrl: string | null;
  effectiveFrom: string | null;
  normalizedObjectKey: string;
}

export interface SourceRevisionReadRepository {
  findReadableRevision(input: {
    workspaceId: string;
    sourceRevisionId: string;
  }): Promise<SourceRevisionRecord | null>;
}

export interface CitationSource {
  kind: "wiki" | "source";
  label: string;
  slug?: string;
  sourceRevisionId?: string;
  locator?: string;
  effectiveFrom?: string | null;
}

export type AskEvent =
  | { type: "tool"; name: ToolName }
  | { type: "text"; text: string }
  | { type: "source"; source: CitationSource }
  | { type: "abstain"; reason: string }
  | { type: "done" };

export interface ToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
}

export type ProviderResponse =
  | { kind: "tool"; call: ToolCall; usage?: TokenUsage; rawAssistantText?: string }
  | { kind: "final"; text: string; usage?: TokenUsage };

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: ToolName;
  toolCall?: ToolCall;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmProvider {
  readonly providerName: string;
  readonly model: string;
  next(input: {
    messages: ProviderMessage[];
    tools: readonly ToolDefinition[];
  }): Promise<ProviderResponse>;
}

export interface RateLimiter {
  consume(input: { workspaceId: string; userId: string; cost: number }): Promise<void>;
}

export interface BudgetTracker {
  reserve(input: { workspaceId: string; userId: string; purpose: "ask" }): Promise<void>;
  finalize(input: {
    callId: string;
    workspaceId: string;
    userId: string;
    provider: string;
    model: string;
    usage: TokenUsage;
    success: boolean;
    errorCode: string | null;
    latencyMs: number;
  }): Promise<void>;
}

export interface AiLogSink {
  logSearch(input: {
    workspaceId: string;
    userId: string;
    query: string;
    scope: "ask-agent";
    resultCount: number;
    latencyMs: number;
  }): Promise<void>;
}

export interface AskAgentDeps {
  context: ToolContext;
  provider: LlmProvider;
  searcher: Pick<ReturnType<typeof createEvidenceSearcher>, "searchEvidence">;
  wikiRepo: Pick<GitRepo, "headSha" | "readBlob">;
  sourceRevisionRepository: SourceRevisionReadRepository;
  objectStore: Pick<ImmutableObjectStore, "getText">;
  locateSourceSegment: (text: string, locator: string) => string | null;
  rateLimiter: RateLimiter;
  budget: BudgetTracker;
  logs: AiLogSink;
  now?: () => Date;
}

export interface SourceReadResult {
  sourceRevisionId: string;
  locator: string;
  effectiveFrom: string | null;
  text: string;
}

export interface WikiReadResult {
  slug: string;
  path: string;
  gitSha: string;
  body: string;
}
