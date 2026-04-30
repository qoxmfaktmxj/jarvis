"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { and, eq } from "drizzle-orm";
import { PERMISSIONS } from "@jarvis/shared/constants";
import { wikiSavePayloadSchema } from "@jarvis/shared/validation";
import {
  GitRepo,
  defaultBotAuthor,
  parseFrontmatter,
  serializeFrontmatter,
  type WikiSensitivity,
} from "@jarvis/wiki-fs";
import { getWikiRepoRoot } from "@/lib/server/repo-root";
import { projectLinks } from "@jarvis/wiki-agent/projection";
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
  // 보안 필드는 클라이언트 입력에서 제거 — 기존 DB 값 유지 (A안)
  const {
    sensitivity: _s,
    requiredPermission: _rp,
    publishedStatus: _ps,
    ...safeFm
  } = parsed.data.frontmatter;

  // 기존 DB row에서 보안 필드 조회 (신규 페이지는 INTERNAL/knowledge:read defaults)
  const existingRow = await db
    .select({
      sensitivity: wikiPageIndex.sensitivity,
      requiredPermission: wikiPageIndex.requiredPermission,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, parsed.data.workspaceId),
        eq(wikiPageIndex.path, repoRelPath),
      ),
    )
    .limit(1);

  const securityFields = existingRow[0] ?? {
    sensitivity: "INTERNAL" as WikiSensitivity,
    requiredPermission: "knowledge:read" as string | null,
  };

  const mergedFm = {
    ...safeFm,
    workspaceId: parsed.data.workspaceId,
    authority: "manual" as const,
    updated: new Date().toISOString(),
    sensitivity: (securityFields.sensitivity ?? "INTERNAL") as WikiSensitivity,
    requiredPermission: securityFields.requiredPermission ?? "knowledge:read",
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

  // wikiPageIndex projection upsert + wiki_page_link projection (body 미포함 — body-column-guard 준수)
  try {
    const { data: fmData } = parseFrontmatter(fileContent);
    // Code review HIGH E — frontmatter 에서 파생되는 컬럼들은 insert/update 양쪽에 동일하게
    // 적용되어야 한다. 이전엔 set 에 type/requiredPermission/publishedStatus 가 누락돼 있어
    // 사용자가 frontmatter 의 requiredPermission 을 강화해도 projection 은 약한 권한을 유지 →
    // 검색·page-first·Ask AI 에서 ACL 우회 발생.
    const projectionColumns = {
      title: typeof fmData.title === "string" && fmData.title ? fmData.title : pageSlugClean,
      slug: pageSlugClean,
      type: (fmData.type ?? "concept") as string,
      authority: "manual" as const,
      sensitivity: (fmData.sensitivity ?? "INTERNAL") as string,
      requiredPermission:
        typeof fmData.requiredPermission === "string"
          ? fmData.requiredPermission
          : "knowledge:read",
      frontmatter: fmData as Record<string, unknown>,
      gitSha: sha,
      stale: false,
      publishedStatus: "published" as const,
      freshnessSlaDays: typeof fmData.freshnessSlaDays === "number" ? fmData.freshnessSlaDays : null,
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(wikiPageIndex)
        .values({
          workspaceId: parsed.data.workspaceId,
          path: repoRelPath,
          ...projectionColumns,
        })
        .onConflictDoUpdate({
          target: [wikiPageIndex.workspaceId, wikiPageIndex.path],
          set: {
            ...projectionColumns,
            updatedAt: new Date(),
          },
        });

      // wiki_page_link projection: index upsert 이후 동일 tx에서 실행하므로
      // projectLinks가 fromPageId를 조회할 수 있다.
      await projectLinks(tx, {
        workspaceId: parsed.data.workspaceId,
        sourcePath: repoRelPath,
        body: incomingBody,
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
