// apps/worker/src/helpers/import-knowledge.ts

import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import {
  knowledgePage,
  knowledgePageVersion,
} from '@jarvis/db/schema/knowledge';
import { boss } from '../lib/boss.js';

export interface ImportKnowledgeParams {
  workspaceId: string;
  title: string;
  slug: string;
  mdxContent: string;
  pageType: string;      // e.g. 'analysis', 'wiki'
  sensitivity: string;   // e.g. 'INTERNAL'
  createdBy: string;     // userId
}

/**
 * Creates a knowledge_page + knowledge_page_version in a single transaction,
 * then enqueues a compile job. The compile handler chains to embed automatically.
 *
 * Returns the created pageId.
 */
export async function importAsKnowledgePage(
  params: ImportKnowledgeParams,
): Promise<string> {
  const pageId = randomUUID();
  const versionId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(knowledgePage).values({
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: params.slug,
      sensitivity: params.sensitivity,
      publishStatus: 'published',
      createdBy: params.createdBy,
    });

    await tx.insert(knowledgePageVersion).values({
      id: versionId,
      pageId,
      versionNumber: 1,
      title: params.title,
      mdxContent: params.mdxContent,
      changeNote: 'Auto-imported from Graphify analysis',
      authorId: params.createdBy,
    });
  });

  // Enqueue compile → (auto) embed chain
  await boss.send('compile', { pageId });
  console.log(
    `[import-knowledge] Created pageId=${pageId} title="${params.title}" → compile enqueued`,
  );

  return pageId;
}

/**
 * Generates a URL-safe slug from a title.
 * Supports Korean characters (가-힣) in addition to ASCII.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
