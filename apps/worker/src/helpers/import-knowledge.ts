// apps/worker/src/helpers/import-knowledge.ts

import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import {
  knowledgePage,
  knowledgePageVersion,
} from '@jarvis/db/schema/knowledge';
import { sql, eq, and, desc } from 'drizzle-orm';
import { boss } from '../lib/boss.js';

export interface ImportKnowledgeParams {
  workspaceId: string;
  title: string;
  slug: string;
  mdxContent: string;
  pageType: string;
  sensitivity: string;
  createdBy: string | null;
  sourceType: string;
  sourceKey: string;
}

export interface ImportKnowledgeResult {
  pageId: string;
  wasCreated: boolean;
  wasUpdated: boolean;
  versionNumber: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Upsert a knowledge page by external key (sourceType + sourceKey).
 *
 * On first import: creates page + version 1, enqueues compile.
 * On rebuild (same sourceKey): creates a new version if content changed,
 *   preserves user-set publishStatus, enqueues compile.
 * On rebuild (same sourceKey, same content): no-op, no compile.
 *
 * Returns pageId, wasCreated, wasUpdated, versionNumber.
 */
export async function importAsKnowledgePage(
  params: ImportKnowledgeParams,
): Promise<ImportKnowledgeResult> {
  const result = await db.transaction(async (tx) => {
    // 1. Look up by external key with row lock
    const existingRows = await tx.execute<{
      id: string;
      title: string;
    }>(sql`
      SELECT id, title FROM knowledge_page
      WHERE workspace_id = ${params.workspaceId}::uuid
        AND source_type = ${params.sourceType}
        AND source_key  = ${params.sourceKey}
      FOR UPDATE
      LIMIT 1
    `);
    const existing = existingRows.rows[0];

    if (existing) {
      // 2. Fetch latest version's mdxContent
      const [latestVer] = await tx
        .select({
          versionNumber: knowledgePageVersion.versionNumber,
          mdxContent: knowledgePageVersion.mdxContent,
        })
        .from(knowledgePageVersion)
        .where(eq(knowledgePageVersion.pageId, existing.id))
        .orderBy(desc(knowledgePageVersion.versionNumber))
        .limit(1);

      if (latestVer && latestVer.mdxContent === params.mdxContent) {
        // Content unchanged — no-op
        return {
          pageId: existing.id,
          wasCreated: false,
          wasUpdated: false,
          versionNumber: latestVer.versionNumber,
        };
      }

      const nextVersion = (latestVer?.versionNumber ?? 0) + 1;

      await tx.insert(knowledgePageVersion).values({
        id: randomUUID(),
        pageId: existing.id,
        versionNumber: nextVersion,
        title: params.title,
        mdxContent: params.mdxContent,
        changeNote: 'Auto-reimported from Graphify (rebuild)',
        authorId: params.createdBy,
      });

      // Update title, sensitivity, and updatedAt — do NOT touch publishStatus.
      // Sensitivity must be refreshed so tightened source access takes effect immediately.
      await tx
        .update(knowledgePage)
        .set({ title: params.title, sensitivity: params.sensitivity, updatedAt: new Date() })
        .where(eq(knowledgePage.id, existing.id));

      return {
        pageId: existing.id,
        wasCreated: false,
        wasUpdated: true,
        versionNumber: nextVersion,
      };
    }

    // 3. Insert path — slug collision check (across all sources in workspace)
    let resolvedSlug = params.slug;
    const existingSlugs = await tx
      .select({ slug: knowledgePage.slug })
      .from(knowledgePage)
      .where(
        and(
          eq(knowledgePage.workspaceId, params.workspaceId),
          sql`${knowledgePage.slug} LIKE ${params.slug + '%'}`,
        ),
      );
    if (existingSlugs.some((r) => r.slug === resolvedSlug)) {
      const maxSuffix = existingSlugs.reduce((max, r) => {
        const m = r.slug.match(new RegExp(`^${escapeRegex(params.slug)}-(\\d+)$`));
        return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
      }, 0);
      resolvedSlug = `${params.slug}-${maxSuffix + 1}`;
    }

    const pageId = randomUUID();
    await tx.insert(knowledgePage).values({
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: resolvedSlug,
      sensitivity: params.sensitivity,
      publishStatus: 'published',
      sourceType: params.sourceType,
      sourceKey: params.sourceKey,
      createdBy: params.createdBy,
    });

    await tx.insert(knowledgePageVersion).values({
      id: randomUUID(),
      pageId,
      versionNumber: 1,
      title: params.title,
      mdxContent: params.mdxContent,
      changeNote: 'Auto-imported from Graphify',
      authorId: params.createdBy,
    });

    return {
      pageId,
      wasCreated: true,
      wasUpdated: true,
      versionNumber: 1,
    };
  });

  // Enqueue compile only if content actually changed
  if (result.wasCreated || result.wasUpdated) {
    await boss.send('compile', { pageId: result.pageId });
    console.log(
      `[import-knowledge] sourceKey=${params.sourceKey} pageId=${result.pageId} wasCreated=${result.wasCreated} wasUpdated=${result.wasUpdated} v${result.versionNumber} → compile enqueued`,
    );
  } else {
    console.log(
      `[import-knowledge] sourceKey=${params.sourceKey} pageId=${result.pageId} unchanged (v${result.versionNumber}), skipping compile`,
    );
  }

  return result;
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
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
  return slug || 'page';
}
