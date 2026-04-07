export interface SourceRef {
  pageId: string;
  pageTitle: string;
  pageType?: string;
  pageUrl?: string;
  relevance?: number;
  excerpt?: string;
}

export interface Claim {
  text: string;
  source: SourceRef;
  confidence: number;
}

export interface AskResult {
  answer: string;
  claims: Claim[];
  sources: SourceRef[];
  totalTokens?: number;
}

export interface EmbeddingResult {
  pageId: string;
  embedding: number[];
}

export type SSEEventType = "text" | "sources" | "done" | "error";

export interface SSETextEvent {
  type: "text";
  content: string;
}

export interface SSESourcesEvent {
  type: "sources";
  sources: SourceRef[];
}

export interface SSEDoneEvent {
  type: "done";
  totalTokens: number;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent =
  | SSETextEvent
  | SSESourcesEvent
  | SSEDoneEvent
  | SSEErrorEvent;
