export type ResourceType = "wiki" | "source" | "legal_case";

export interface EvidenceSearchInput {
  workspaceId: string;
  query: string;
  asOf?: string;
  types: readonly ResourceType[];
  page: number;
  limit: number;
}

export interface EvidenceSearchHit {
  resourceType: ResourceType;
  id: string;
  title: string;
  snippet: string;
  score: number;
  slug: string | null;
  path: string | null;
  sourceRevisionId: string | null;
  locator: string | null;
  effectiveFrom: string | null;
  canonicalUrl: string | null;
}
