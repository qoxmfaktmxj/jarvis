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

// ---------------------------------------------------------------------------
// Cases Layer SourceRef — 유지보수 사례 (precedent_case)
// ---------------------------------------------------------------------------
export interface CaseSourceRef {
  kind: 'case';
  caseId: string;
  title: string;
  symptom: string | null;
  action: string | null;
  requestCompany: string | null;
  clusterLabel: string | null;
  result: string | null;   // resolved | workaround | escalated | no_fix | info_only
  confidence: number;
}

// ---------------------------------------------------------------------------
// Directory Layer SourceRef — 시스템·양식·담당자 바로가기 (directory_entry)
// ---------------------------------------------------------------------------
export interface DirectorySourceRef {
  kind: 'directory';
  entryId: string;
  entryType: string;       // tool | form | contact | system_link | guide_link
  name: string;
  nameKo: string | null;
  url: string | null;
  category: string | null;
  ownerTeam: string | null;
}

// ---------------------------------------------------------------------------
// Document Chunks Layer SourceRef — hybrid BM25+vector retrieved chunks
// ---------------------------------------------------------------------------
export interface ChunkSourceRef {
  kind: 'chunk';
  chunkId: string;
  documentType: string;
  documentId: string;
  chunkIndex: number;
  excerpt: string;      // first 200 chars
  sensitivity: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Wiki Page SourceRef — page-first navigation (Phase-W2 T2)
//
// Emitted by `packages/ai/page-first/*` when the feature flag
// FEATURE_PAGE_FIRST_QUERY is on. Citations are surfaced to the UI in
// `[[page-slug]]` form; the editor can then resolve the slug to a real
// wiki URL via `packages/wiki-fs/wikilink`.
// ---------------------------------------------------------------------------
export interface WikiPageSourceRef {
  kind: "wiki-page";
  pageId: string;
  path: string;          // repo-relative, e.g. "auto/entities/MindVault.md"
  slug: string;          // citation anchor, e.g. "mindvault"
  title: string;
  sensitivity: string;   // PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY
  /** `[[page-slug]]` — convenience for the UI so it doesn't need to reformat. */
  citation: string;
  /** Rank origin: "shortlist" (lexical hit) or "expand" (1-hop wikilink). */
  origin: "shortlist" | "expand";
  confidence: number;
}

export type SourceRef =
  | TextSourceRef
  | GraphSourceRef
  | CaseSourceRef
  | DirectorySourceRef
  | ChunkSourceRef
  | WikiPageSourceRef;

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

export type SSEEventType = 'text' | 'sources' | 'done' | 'error' | 'route' | 'meta';

export interface SSETextEvent { type: 'text'; content: string }
export interface SSESourcesEvent { type: 'sources'; sources: SourceRef[] }
export interface SSEDoneEvent { type: 'done'; totalTokens: number }
export interface SSEErrorEvent { type: 'error'; message: string }
export interface SSERouteEvent { type: 'route'; lane: string; confidence: number }
/**
 * Phase-W2 T2: side-channel metadata event.
 *
 * Currently used by page-first navigation to signal whether the user's
 * question+answer is a candidate for "Save as Page" (i.e. synthesized from
 * wiki pages and not a trivial lookup). Kept generic (`Record<string, unknown>`)
 * so future retrieval modes can add fields without widening the union.
 */
export interface SSEMetaEvent { type: 'meta'; meta: Record<string, unknown> }
export type SSEEvent =
  | SSETextEvent
  | SSESourcesEvent
  | SSEDoneEvent
  | SSEErrorEvent
  | SSERouteEvent
  | SSEMetaEvent;

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

export interface RetrievedChunk {
  id: string;
  documentType: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  sensitivity: string;
  vectorSim: number;
  ftsRank: number;
  rrfScore: number;
}

export type AskMode = 'simple' | 'expert';

export interface AskQuery {
  question: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  snapshotId?: string;          // explicit graph scope
  userCompany?: string;         // 사용자 소속 고객사 (case 검색 부스팅)
  mode?: AskMode;               // simple: 간결 답변, expert: 상세 답변 (default: simple)
  requestId?: string | null;    // x-request-id 헤더에서 주입된 요청 추적 ID
  sensitivityScope?: string;    // RBAC-derived cache scope (e.g. 'workspace:X|level:internal')
}
