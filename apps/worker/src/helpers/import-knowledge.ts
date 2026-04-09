// apps/worker/src/helpers/import-knowledge.ts

import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import {
  knowledgePage,
  knowledgePageVersion,
} from '@jarvis/db/schema/knowledge';
import { sql } from 'drizzle-orm';
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // Deduplicate slug: if the base slug exists in this workspace, append a numeric suffix
  let resolvedSlug = params.slug;
  {
    const existing = await db
      .select({ slug: knowledgePage.slug })
      .from(knowledgePage)
      .where(
        sql`workspace_id = ${params.workspaceId}::uuid AND slug LIKE ${params.slug + '%'}`,
      );
    if (existing.some((r) => r.slug === resolvedSlug)) {
      const maxSuffix = existing.reduce((max, r) => {
        const match = r.slug.match(new RegExp(`^${escapeRegex(params.slug)}-(\\d+)$`));
        return match ? Math.max(max, parseInt(match[1]!, 10)) : max;
      }, 0);
      resolvedSlug = `${params.slug}-${maxSuffix + 1}`;
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(knowledgePage).values({
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: resolvedSlug,
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

  // Enqueue compile → (auto) embed chain.
  // NOTE: boss.send runs after the transaction commits, so a queue failure here
  // leaves a published page with no compile job. For now this is acceptable since
  // pg-boss has retry logic and pages can be manually recompiled.
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
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') // trim leading/trailing dashes
    .slice(0, 200);
  return slug || 'page'; // guard empty string
}
