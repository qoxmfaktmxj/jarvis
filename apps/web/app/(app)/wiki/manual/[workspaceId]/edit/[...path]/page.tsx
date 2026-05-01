import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PERMISSIONS } from "@jarvis/shared/constants";
import { readUtf8, exists } from "@jarvis/wiki-fs";
import * as path from "node:path";
import { requirePageSession } from "@/lib/server/page-auth";
import { getWikiRepoRoot } from "@/lib/server/repo-root";
import { PageHeader } from "@/components/patterns/PageHeader";
import EditPageClientShell from "./_client-shell";

interface EditPageProps {
  params: Promise<{
    workspaceId: string;
    path: string[];
  }>;
}

export const dynamic = "force-dynamic";

const EMPTY_TEMPLATE = `---
title: ""
sensitivity: INTERNAL
tags: []
---

`;

export default async function ManualWikiEditPage({ params }: EditPageProps) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_UPDATE, "/dashboard");
  const { workspaceId, path: pathSeg } = await params;
  const t = await getTranslations("WikiEditor");
  // Next.js 15 dynamic catch-all segments are URL-encoded; decode before joining.
  const slug = (pathSeg ?? [])
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");

  // workspace 일치 검증 — 다른 워크스페이스 편집 차단
  if (session.workspaceId !== workspaceId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-destructive">
        forbidden
      </div>
    );
  }

  // --- Path traversal guard (P1) ---
  // Normalize backslashes to forward slashes first.
  const normalizedSlug = slug.replace(/\\/g, "/");

  // Strip an optional trailing `.md` so the URL works either way
  // (`/edit/test-page` and `/edit/test-page.md` both map to the same file).
  // The action layer assumes pageSlug WITHOUT the `.md` extension and adds
  // it back when computing `wiki/{ws}/manual/{slug}.md` — leaving `.md` here
  // would cause double-extension `manual/test-page.md.md` saves.
  const slugNoExt = normalizedSlug.replace(/\.md$/, "");

  // Reject slugs that:
  //   - are empty
  //   - start with "/" (absolute path injection)
  //   - contain null bytes
  //   - have any segment that is exactly ".." (directory traversal)
  //   - have any segment that is exactly "." or empty (e.g. "//", trailing "/")
  if (
    slugNoExt.length === 0 ||
    slugNoExt.startsWith("/") ||
    slugNoExt.includes("\0") ||
    slugNoExt.split("/").some((seg) => seg === ".." || seg === "." || seg.length === 0)
  ) {
    notFound();
  }

  const repoRoot = getWikiRepoRoot();
  const manualBase = path.resolve(repoRoot, "wiki", workspaceId, "manual");
  const fileAbs = path.resolve(manualBase, `${slugNoExt}.md`);

  // Boundary check: resolved absolute path must stay strictly inside the manual tree.
  if (!fileAbs.startsWith(manualBase + path.sep)) {
    notFound();
  }

  let initialContent = EMPTY_TEMPLATE;
  if (await exists(fileAbs)) {
    try {
      initialContent = await readUtf8(fileAbs);
    } catch (err) {
      console.error("[wiki:manual:edit] read failed:", err);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Alert variant="default" className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <AlertDescription>{t("manualOnlyBanner")}</AlertDescription>
        </div>
      </Alert>

      <PageHeader
        eyebrow="Wiki · Manual"
        title={`wiki/manual/${slugNoExt}.md`}
        description={`workspace: ${workspaceId}`}
      />

      <EditPageClientShell
        initialContent={initialContent}
        workspaceId={workspaceId}
        pageSlug={slugNoExt}
      />
    </div>
  );
}
