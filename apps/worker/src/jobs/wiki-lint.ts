import { and, count, eq } from "drizzle-orm";
import { wikiLintReport, wikiPageIndex, wikiPageLink, wikiReviewQueue } from "@jarvis/db";
import { createTempWorktree, type GitRepo } from "@jarvis/wiki-fs";
import { projectCurrentHeadInTx } from "../lib/projection.js";
import { withWorkspaceSingleWriter } from "../lib/single-writer.js";

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function lintWorkspace(input: {
  workspaceId: string;
  repo: GitRepo;
  reportDate?: string;
  now?: Date;
}): Promise<{ commitSha: string; reportPath: string }> {
  const reportDate = input.reportDate ?? formatDate(input.now ?? new Date());
  const reportPath = `_system/lint-report-${reportDate}.md`;

  return withWorkspaceSingleWriter(input.workspaceId, async (tx) => {
    await projectCurrentHeadInTx({ workspaceId: input.workspaceId, repo: input.repo }, tx);

    const [pages, links, contradictionCount, staleCount] = await Promise.all([
      tx
        .select({ id: wikiPageIndex.id, path: wikiPageIndex.path, title: wikiPageIndex.title })
        .from(wikiPageIndex)
        .where(eq(wikiPageIndex.workspaceId, input.workspaceId)),
      tx
        .select({
          fromPageId: wikiPageLink.fromPageId,
          toPageId: wikiPageLink.toPageId,
          toPath: wikiPageLink.toPath,
        })
        .from(wikiPageLink)
        .where(eq(wikiPageLink.workspaceId, input.workspaceId)),
      tx
        .select({ value: count() })
        .from(wikiReviewQueue)
        .where(and(
          eq(wikiReviewQueue.workspaceId, input.workspaceId),
          eq(wikiReviewQueue.kind, "contradiction"),
          eq(wikiReviewQueue.status, "pending"),
        )),
      tx
        .select({ value: count() })
        .from(wikiPageIndex)
        .where(and(eq(wikiPageIndex.workspaceId, input.workspaceId), eq(wikiPageIndex.stale, true))),
    ]);

    const outbound = new Map<string, number>();
    const inbound = new Map<string, number>();
    const pathById = new Map(pages.map((page) => [page.id, page.path]));
    const broken = links
      .filter((link) => !link.toPageId)
      .map((link) => ({
        from: pathById.get(link.fromPageId) ?? "unknown",
        to: link.toPath,
      }));

    for (const link of links) {
      outbound.set(link.fromPageId, (outbound.get(link.fromPageId) ?? 0) + 1);
      if (link.toPageId) inbound.set(link.toPageId, (inbound.get(link.toPageId) ?? 0) + 1);
    }

    const orphanPaths = pages
      .filter((page) => (inbound.get(page.id) ?? 0) === 0 && (outbound.get(page.id) ?? 0) === 0)
      .map((page) => page.path);
    const noOutlinkPaths = pages
      .filter((page) => (outbound.get(page.id) ?? 0) === 0)
      .map((page) => page.path);

    const report = [
      "# Public Jarvis Wiki Lint Report",
      "",
      `- date: ${reportDate}`,
      `- pageCount: ${pages.length}`,
      `- orphanCount: ${orphanPaths.length}`,
      `- brokenLinkCount: ${broken.length}`,
      `- noOutlinkCount: ${noOutlinkPaths.length}`,
      `- contradictionCount: ${contradictionCount[0]?.value ?? 0}`,
      `- staleCount: ${staleCount[0]?.value ?? 0}`,
      "",
      "## Orphans",
      ...(orphanPaths.length > 0 ? orphanPaths.map((path) => `- ${path}`) : ["- none"]),
      "",
      "## Broken Links",
      ...(broken.length > 0 ? broken.map((item) => `- ${item.from} -> ${item.to}`) : ["- none"]),
      "",
      "## No Outlinks",
      ...(noOutlinkPaths.length > 0 ? noOutlinkPaths.map((path) => `- ${path}`) : ["- none"]),
      "",
    ].join("\n");

    const baseSha = await input.repo.headSha();
    const handle = await createTempWorktree(input.repo, { baseSha });
    try {
      const commit = await handle.repo.writeAndCommit({
        actor: "system",
        files: { [reportPath]: report },
        message: `[lint] ${reportDate}`,
        author: {
          name: "jarvis-public-wiki-bot",
          email: "wiki-bot@example.invalid",
        },
      });
      await input.repo.fastForwardTo(commit.sha, baseSha);
      await projectCurrentHeadInTx({ workspaceId: input.workspaceId, repo: input.repo }, tx);

      const values = {
        orphanCount: orphanPaths.length,
        brokenLinkCount: broken.length,
        noOutlinkCount: noOutlinkPaths.length,
        contradictionCount: Number(contradictionCount[0]?.value ?? 0),
        staleCount: Number(staleCount[0]?.value ?? 0),
        reportPath,
      };

      await tx
        .insert(wikiLintReport)
        .values({
          workspaceId: input.workspaceId,
          reportDate,
          ...values,
        })
        .onConflictDoUpdate({
          target: [wikiLintReport.workspaceId, wikiLintReport.reportDate],
          set: values,
        });

      if (orphanPaths.length || broken.length || noOutlinkPaths.length) {
        await tx.insert(wikiReviewQueue).values({
          workspaceId: input.workspaceId,
          kind: "lint",
          affectedPages: [...new Set([...orphanPaths, ...noOutlinkPaths, ...broken.map((item) => item.from)])],
          commitSha: commit.sha,
          description: "Wiki lint 결과에 검토할 항목이 있습니다.",
          payload: { orphanPaths, broken, noOutlinkPaths },
          status: "pending",
        });
      }

      return { commitSha: commit.sha, reportPath };
    } finally {
      await handle.cleanup();
    }
  });
}
