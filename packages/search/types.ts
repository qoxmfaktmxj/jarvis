export type SearchSortBy =
  | "relevance"
  | "date"
  | "popularity"
  | "newest"
  | "freshness"
  | "hybrid";

export interface SearchQuery {
  query?: string;
  q?: string;
  workspaceId: string;
  userId: string;
  userRoles: string[];
  filters?: {
    pageType?: string[];
    sensitivity?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  pageType?: string;
  sensitivity?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "relevance" | "newest" | "freshness" | "hybrid";
  sortBy?: SearchSortBy;
  page?: number;
  pageSize?: number;
  limit?: number;
  highlight?: boolean;
  explain?: boolean;
}

export interface SearchHit {
  id: string;
  resourceType?: "knowledge" | "project" | "system";
  pageType?: string;
  title: string;
  headline?: string;
  snippet?: string;
  sensitivity?: string;
  updatedAt: string;
  ftsRank?: number;
  trgmSim?: number;
  freshness?: number;
  hybridScore?: number;
  url?: string;
}

export interface SearchFacets {
  byPageType: Record<string, number>;
  bySensitivity: Record<string, number>;
}

export interface ScoreBreakdown {
  keyword: number;
  vector: number;
  trgm: number;
  freshness: number;
  final: number;
}

export interface SearchResultItem {
  id: string;
  pageType: string;
  title: string;
  snippet: string;
  sensitivity: string;
  score: number;
  scores?: ScoreBreakdown;
  updatedAt: string;
  owners: string[];
  tags: string[];
}

export interface SearchResult {
  hits?: SearchHit[];
  items?: SearchResultItem[];
  total: number;
  page?: number;
  pageSize?: number;
  facets: SearchFacets;
  suggestions: string[];
  query?: string;
  durationMs?: number;
}
