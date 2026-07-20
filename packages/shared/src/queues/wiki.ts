import { z } from "zod";

export const SOURCE_INGEST_QUEUE = "source-ingest" as const;
export const WIKI_PROJECT_QUEUE = "wiki-project" as const;
export const WIKI_RECONCILE_QUEUE = "wiki-reconcile" as const;
export const WIKI_LINT_QUEUE = "wiki-lint" as const;
export const DEMO_ACCOUNT_CLEANUP_QUEUE = "demo-account-cleanup" as const;

export function wikiIngestQueueName(workspaceId: string): string {
  return `wiki-ingest:${workspaceId}`;
}

export const sourceIngestPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  providerId: z.string().min(1).max(80),
  externalId: z.string().min(1).max(180),
  retrievedAt: z.string().datetime().optional(),
});

export const wikiIngestPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  sourceRevisionId: z.string().uuid(),
});

export const wikiProjectPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/i),
  sourceRevisionId: z.string().uuid().nullable().optional(),
});

export const wikiReconcilePayloadSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const wikiLintPayloadSchema = z.object({
  workspaceId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const demoCleanupPayloadSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  now: z.string().datetime().optional(),
});

export type SourceIngestPayload = z.infer<typeof sourceIngestPayloadSchema>;
export type WikiIngestPayload = z.infer<typeof wikiIngestPayloadSchema>;
export type WikiProjectPayload = z.infer<typeof wikiProjectPayloadSchema>;
export type WikiReconcilePayload = z.infer<typeof wikiReconcilePayloadSchema>;
export type WikiLintPayload = z.infer<typeof wikiLintPayloadSchema>;
export type DemoCleanupPayload = z.infer<typeof demoCleanupPayloadSchema>;
