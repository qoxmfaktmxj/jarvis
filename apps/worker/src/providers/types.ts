export type SourceType = "law" | "case" | "interpretation" | "guide";

export interface ProviderListItem {
  externalId: string;
  title: string;
}

export interface ProviderPayload {
  document: {
    provider: string;
    externalId: string;
    sourceType: SourceType;
    title: string;
    canonicalUrl: string;
    metadata: Record<string, unknown>;
  };
  revision: {
    revisionKey: string;
    publishedAt: Date | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    rawBytes: Uint8Array;
    contentType: string;
    normalizedText: string;
    metadata: Record<string, unknown>;
  };
}

export interface ProviderAdapter {
  readonly id: string;
  readonly canonicalHostnames: ReadonlySet<string>;
  list(cursor?: string): Promise<{ items: ProviderListItem[]; nextCursor?: string }>;
  fetch(externalId: string): Promise<ProviderPayload>;
}
