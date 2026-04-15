import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PERMISSIONS } from "@jarvis/shared/constants";
import { readUtf8, exists } from "@jarvis/wiki-fs";
import * as path from "node:path";
import { requirePageSession } from "@/lib/server/page-auth";
import { getWikiRepoRoot } from "@/lib/server/repo-root";
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
  const slug = (pathSeg ?? []).join("/");

  // workspace 일치 검증 — 다른 워크스페이스 편집 차단
  if (session.workspaceId !== workspaceId) {
    return (
      <div className="max-w-5xl mx-auto py-16 px-4 text-center text-sm text-red-600">
        forbidden
      </div>
    );
  }

  const repoRoot = getWikiRepoRoot();
  const fileAbs = path.join(repoRoot, "wiki", workspaceId, "manual", `${slug}.md`);

  let initialContent = EMPTY_TEMPLATE;
  if (await exists(fileAbs)) {
    try {
      initialContent = await readUtf8(fileAbs);
    } catch (err) {
      console.error("[wiki:manual:edit] read failed:", err);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
          <AlertDescription>{t("manualOnlyBanner")}</AlertDescription>
        </div>
      </Alert>

      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            wiki/manual/{slug}
          </h1>
          <p className="text-xs text-gray-500 mt-1">workspace: {workspaceId}</p>
        </div>
      </div>

      <EditPageClientShell
        initialContent={initialContent}
        workspaceId={workspaceId}
        pageSlug={slug}
      />
    </div>
  );
}
