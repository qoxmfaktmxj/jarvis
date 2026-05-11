"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { db } from "@jarvis/db/client";
import { auditLog } from "@jarvis/db/schema/audit";
import { PERMISSIONS } from "@jarvis/shared/constants";
import { wikiSavePayloadSchema } from "@jarvis/shared/validation";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import {
  GitRepo,
  defaultBotAuthor,
  parseFrontmatter,
  serializeFrontmatter,
} from "@jarvis/wiki-fs";
import { getWikiRepoRoot } from "@/lib/server/repo-root";
import { projectManualPage } from "@jarvis/wiki-agent/projection";
import * as path from "node:path";

export type SaveWikiPageError =
  | "forbidden"
  | "invalid_input"
  | "git_failed"
  | "boundary_violation"
  | "projection_failed";

export type SaveWikiPageResult =
  | { ok: true; sha: string }
  | { ok: false; error: SaveWikiPageError };

interface SaveWikiPagePayload {
  workspaceId: string;
  pageSlug: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
}

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

/**
 * Phase-W2 C1 — manual wiki page save.
 *
 * 1. requirePageSession-equivalent (KNOWLEDGE_UPDATE).
 * 2. Validate payload (zod).
 * 3. Re-validate path is `wiki/{ws}/manual/**` server-side (W3 boundary 방어).
 * 4. Merge frontmatter + body, GitRepo.writeAndCommit.
 * 5. Upsert wikiPageIndex projection (frontmatter only — body 절대 저장 금지).
 * 6. revalidatePath the public wiki view.
 */
export async function saveWikiPage(
  payload: SaveWikiPagePayload,
): Promise<SaveWikiPageResult> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "forbidden" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "forbidden" };

  if (!hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE)) {
    return { ok: false, error: "forbidden" };
  }

  const parsed = wikiSavePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  // workspace 일치 (세션과 입력)
  if (parsed.data.workspaceId !== session.workspaceId) {
    return { ok: false, error: "forbidden" };
  }

  // 경로 boundary 재검증 — manual/ 트리만 허용
  const pageSlugClean = parsed.data.pageSlug.replace(/^\/+|\/+$/g, "");
  const repoRelPath = `wiki/${parsed.data.workspaceId}/manual/${pageSlugClean}.md`;
  if (!repoRelPath.startsWith(`wiki/${parsed.data.workspaceId}/manual/`)) {
    return { ok: false, error: "boundary_violation" };
  }
  // 또한 .. 경로 트래버설 차단
  if (pageSlugClean.includes("..") || pageSlugClean.includes("\\")) {
    return { ok: false, error: "boundary_violation" };
  }

  // body 와 frontmatter 분리/병합 (입력 markdown 에 frontmatter 가 포함된 경우 우선)
  let incomingBody: string;
  try {
    const parsed0 = parseFrontmatter(parsed.data.markdown);
    incomingBody = parsed0.body;
  } catch {
    return { ok: false, error: "invalid_input" };
  }
  // sensitivity / requiredPermission / publishedStatus 는 더 이상 row-level 격리
  // 키가 아니므로 클라이언트 입력에서 제거하고 프론트매터에 덧붙이지 않는다.
  // (2026-05-11 sensitivity 제거 step 2A)
  const {
    sensitivity: _s,
    requiredPermission: _rp,
    publishedStatus: _ps,
    ...safeFm
  } = parsed.data.frontmatter;

  const mergedFm = {
    ...safeFm,
    workspaceId: parsed.data.workspaceId,
    authority: "manual" as const,
    updated: new Date().toISOString(),
  };
  const fileContent = serializeFrontmatter(mergedFm, incomingBody);

  // Git commit
  const repoRoot = getWikiRepoRoot();
  const gitRepoPath = path.join(repoRoot, "wiki", parsed.data.workspaceId);
  const git = new GitRepo(gitRepoPath);

  let sha: string;
  try {
    const author = defaultBotAuthor();
    const commitInfo = await git.writeAndCommit({
      // GitRepo.writeAndCommit expects paths relative to repoPath (gitRepoPath above).
      files: { [`manual/${pageSlugClean}.md`]: fileContent },
      message: `[manual] ${pageSlugClean} updated by ${session.userId}`,
      author,
    });
    sha = commitInfo.sha;
  } catch (err) {
    console.error("[wiki:manual:save] git commit failed:", err);
    return { ok: false, error: "git_failed" };
  }

  // Karpathy SSoT compliance: the server action no longer hand-rolls the
  // projection. Instead `projectManualPage` (shared with the worker ingest
  // lane) is invoked inside a single tx so wiki_page_index + wiki_commit_log
  // + wiki_page_link land atomically with the git commit just produced. The
  // helper enforces the `type` whitelist and centralizes the projection
  // contract — UI server actions don't reach into projection columns directly.
  //
  // The same tx also writes the audit_log row (wiki.manual.save) so manual
  // mutations are traceable alongside the projection write.
  try {
    const { data: fmData } = parseFrontmatter(fileContent);
    await db.transaction(async (tx) => {
      const pageId = await projectManualPage(tx, {
        workspaceId: parsed.data.workspaceId,
        sourcePath: repoRelPath,
        slug: pageSlugClean,
        body: incomingBody,
        frontmatter: fmData as Record<string, unknown>,
        commitSha: sha,
        userId: session.userId,
      });
      await writeAuditLog(tx, auditLog, {
        workspaceId: parsed.data.workspaceId,
        userId: session.userId,
        action: "wiki.manual.save",
        resourceType: "wiki_page",
        resourceId: pageId,
        details: {
          sourcePath: repoRelPath,
          slug: pageSlugClean,
          commitSha: sha,
        },
        success: true,
      });
    });
  } catch (err) {
    console.error("[wiki:manual:save] projection upsert failed:", err);
    // git commit은 성공했으나 index/link가 stale — projection_failed로 사용자에게 알린다
    revalidatePath("/wiki/[workspaceId]/[...path]", "page");
    return { ok: false, error: "projection_failed" };
  }

  // catch-all 라우트는 패턴 형식으로 revalidate해야 한다
  revalidatePath("/wiki/[workspaceId]/[...path]", "page");
  return { ok: true, sha };
}
