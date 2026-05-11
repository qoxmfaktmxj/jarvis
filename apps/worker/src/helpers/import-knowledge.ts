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
  /**
   * Optional sensitivity override for the knowledge_page row.
   *
   * Step 2D (2026-05-11): graphify-build no longer derives sensitivity from
   * graph_snapshot lineage (D2=B). When omitted, the knowledge layer applies
   * its own default ('INTERNAL'). Knowledge-domain sweep (Step 2A) drops the
   * column entirely.
   */
  sensitivity?: string;
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

      // Update title and updatedAt — do NOT touch publishStatus.
      // Step 2D (2026-05-11): sensitivity 컬럼 업데이트 제거 (graphify lineage 가 더 이상
      // sensitivity 를 제공하지 않음). 호출자가 명시적으로 전달했을 때만 갱신.
      const updatePayload: Record<string, unknown> = {
        title: params.title,
        updatedAt: new Date(),
      };
      if (params.sensitivity !== undefined) {
        updatePayload['sensitivity'] = params.sensitivity;
      }
      await tx
        .update(knowledgePage)
        .set(updatePayload)
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
    // Step 2D: sensitivity 가 명시되지 않으면 knowledge_page 스키마 default 에 위임.
    const insertPayload: Record<string, unknown> = {
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: resolvedSlug,
      publishStatus: 'published',
      sourceType: params.sourceType,
      sourceKey: params.sourceKey,
      createdBy: params.createdBy,
    };
    if (params.sensitivity !== undefined) {
      insertPayload['sensitivity'] = params.sensitivity;
    }
    await tx.insert(knowledgePage).values(insertPayload as never);

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
