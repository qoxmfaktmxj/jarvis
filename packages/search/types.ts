export type SearchSortBy = 'relevance' | 'newest' | 'freshness' | 'hybrid';
export type ResourceType = 'knowledge' | 'project' | 'system' | 'graph' | 'case';
export type QueryMode = 'phrase' | 'web' | 'prefix';

export interface SearchQuery {
  q: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  userPermissions: string[];
  pageType?: string;
  sensitivity?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SearchSortBy;
  page?: number;
  limit?: number;
}

export interface SearchHit {
  id: string;
  resourceType: ResourceType;
  title: string;
  headline: string;       // ts_headline snippet with <mark> tags
  pageType?: string;
  sensitivity?: string;
  updatedAt: string;
  ftsRank: number;
  trgmSim: number;
  vectorSim?: number;     // Phase-W5: cosine similarity when vector lane ran
  freshness: number;
  hybridScore: number;
  url: string;
}

export interface SearchFacets {
  byPageType: Record<string, number>;
  bySensitivity: Record<string, number>;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  facets: SearchFacets;
  suggestions: string[];   // "did you mean" for zero results
  query: string;
  durationMs: number;
  explain?: ScoreExplain[];  // admin only
}

export interface ScoreExplain {
  id: string;
  ftsRank: number;
  trgmSim: number;
  freshness: number;
  hybridScore: number;
}

export interface ParsedQuery {
  tsquery: string;
  mode: QueryMode;
  sanitized: string;
}

export interface SynonymEntry {
  term: string;
  synonyms: string[];
}

export interface FallbackStep {
  name: 'fts' | 'trgm' | 'synonymExpand' | 'popular';
  used: boolean;
  resultCount: number;
}
