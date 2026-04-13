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

export type SourceRef = TextSourceRef | GraphSourceRef | CaseSourceRef | DirectorySourceRef;

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

export type AskMode = 'simple' | 'expert';

export interface AskQuery {
  question: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  snapshotId?: string;     // explicit graph scope
  userCompany?: string;    // 사용자 소속 고객사 (case 검색 부스팅)
  mode?: AskMode;          // simple: 간결 답변, expert: 상세 답변 (default: simple)
}
