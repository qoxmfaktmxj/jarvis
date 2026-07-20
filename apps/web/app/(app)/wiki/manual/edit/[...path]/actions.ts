"use server";

import { db, auditLog } from "@jarvis/db";
import { buildAuditRow } from "@jarvis/shared/audit";
import { PERMISSIONS } from "@jarvis/shared";
import {
  GitRepo,
  defaultFrontmatter,
  normalizeRepoRelativePath,
  parseFrontmatter,
  serializeFrontmatter,
} from "@jarvis/wiki-fs";
import { z } from "zod";
import { requireActionPermission } from "@/lib/server/action-auth";
import { enqueueWikiProject } from "@/lib/server/wiki-project-queue";

const saveManualPageInput = z.object({
  path: z.string().min(1).max(500),
  title: z.string().min(1).max(240),
  pageType: z.enum(["concept", "guide", "case", "source"]),
  publishedStatus: z.enum(["draft", "published", "archived"]),
  body: z.string().min(1),
});

function requireWikiRepoRoot(): string {
  const value = process.env.WIKI_REPO_ROOT?.trim();
  if (!value) {
    throw new Error("WIKI_REPO_ROOT is required");
  }
  return value;
}

export async function saveManualPage(raw: unknown) {
  const session = await requireActionPermission(PERMISSIONS.WIKI_EDIT);
  const input = saveManualPageInput.parse(raw);
  const normalized = normalizeRepoRelativePath(input.path);
  const path = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  if (!path.startsWith("manual/")) {
    throw new Error("MANUAL_PATH_REQUIRED");
  }

  const repo = new GitRepo(requireWikiRepoRoot());
  let existing;
  try {
    const head = await repo.headSha();
    existing = parseFrontmatter(await repo.readBlob(head, path)).data;
  } catch {
    existing = {
      ...defaultFrontmatter(),
      title: input.title,
      slug: path.replace(/^manual\//, "").replace(/\.md$/, "").split("/").join("-"),
      pageType: input.pageType,
    };
  }

  const nowIso = new Date().toISOString();
  const markdown = serializeFrontmatter(
    {
      ...existing,
      title: input.title,
      pageType: input.pageType,
      publishedStatus: input.publishedStatus,
      sources: existing.sources ?? [],
      aliases: existing.aliases ?? [],
      tags: existing.tags ?? [],
      created: existing.created ?? nowIso,
      updated: nowIso,
    },
    input.body,
  );

  const commit = await repo.writeAndCommit({
    actor: "human",
    files: { [path]: markdown },
    message: `[manual] update ${path}`,
    author: { name: session.displayName, email: "wiki-user@jarvis.invalid" },
  });

  await db.insert(auditLog).values(
    buildAuditRow({
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "wiki.manual.update",
      resourceType: "wiki_page",
      resourceId: path,
      details: { commitSha: commit.sha },
    }),
  );

  try {
    await enqueueWikiProject({ workspaceId: session.workspaceId, commitSha: commit.sha });
  } catch {
    await db.insert(auditLog).values(
      buildAuditRow({
        workspaceId: session.workspaceId,
        userId: session.userId,
        action: "wiki.manual.project_queue_failed",
        resourceType: "wiki_page",
        resourceId: path,
        details: { commitSha: commit.sha, recoveryCommand: "pnpm wiki:project" },
      }),
    );
    return { ok: false, errorCode: "PROJECT_ENQUEUE_FAILED", commitSha: commit.sha } as const;
  }

  return { ok: true, commitSha: commit.sha } as const;
}
