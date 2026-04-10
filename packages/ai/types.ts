// packages/ai/types.ts

export interface TextSourceRef {
  kind: 'text';
  pageId: string;
  title: string;
  url: string;
  excerpt: string;
  confidence: number;
}

export interface GraphSourceRef {
  kind: 'graph';
  snapshotId: string;
  snapshotTitle: string;
  nodeId: string;
  nodeLabel: string;
  sourceFile: string | null;
  communityLabel: string | null;
  relationPath?: string[];
  url: string;
  confidence: number;
}

export type SourceRef = TextSourceRef | GraphSourceRef;

export interface Claim {
  text: string;
  sourceRefs: SourceRef[];
  confidence: 'high' | 'medium' | 'low';
}

export interface AskResult {
  answer: string;
  claims: Claim[];
  sources: SourceRef[];
  totalTokens: number;
}

export type SSEEventType = 'text' | 'sources' | 'done' | 'error';

export interface SSETextEvent { type: 'text'; content: string }
export interface SSESourcesEvent { type: 'sources'; sources: SourceRef[] }
export interface SSEDoneEvent { type: 'done'; totalTokens: number }
export interface SSEErrorEvent { type: 'error'; message: string }
export type SSEEvent = SSETextEvent | SSESourcesEvent | SSEDoneEvent | SSEErrorEvent;

export interface RetrievedClaim {
  id: string;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  claimText: string;
  vectorSim: number;
  ftsRank: number;
  hybridScore: number;
}

export interface AskQuery {
  question: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  snapshotId?: string;     // NEW — explicit graph scope
}
