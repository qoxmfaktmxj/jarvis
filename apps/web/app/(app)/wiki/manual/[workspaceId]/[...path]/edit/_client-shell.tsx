"use client";

/**
 * Client-side shell for the manual wiki edit page.
 * ----------------------------------------------------------------------------
 * Owns the WikiEditor dynamic import (Tiptap has browser-only APIs so ssr:false
 * is required — it must live in a Client Component, not the Server page).
 *
 * Phase-W2: server action (saveWikiPage) wired up. Toast 대신 inline status
 *           표시 — toast 라이브러리 도입은 별도 PR.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Frontmatter } from "@/components/WikiEditor/FrontmatterPanel";
import { saveWikiPage, type SaveWikiPageError } from "./actions";

// Tiptap relies on browser-only APIs (ProseMirror DOM); ssr:false is valid here
// because this file is a Client Component.
const WikiEditor = dynamic(
  () => import("@/components/WikiEditor/WikiEditor").then((m) => m.WikiEditor),
  { ssr: false },
);

interface EditPageClientShellProps {
  initialContent: string;
  workspaceId: string;
  pageSlug: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "ok"; sha: string }
  | { kind: "err"; reason: string };

export default function EditPageClientShell({
  initialContent,
  workspaceId,
  pageSlug,
}: EditPageClientShellProps) {
  const t = useTranslations("WikiEditor");
  const router = useRouter();
  const [draft, setDraft] = useState<{ markdown: string; frontmatter: Frontmatter }>({
    markdown: initialContent,
    frontmatter: { title: "" },
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleChange = (markdown: string, frontmatter: Frontmatter) => {
    setDraft({ markdown, frontmatter });
  };

  const errorReason = (err: SaveWikiPageError): string => {
    switch (err) {
      case "boundary_violation":
        return t("boundaryViolation");
      case "projection_failed":
        return t("projectionFailed");
      case "forbidden":
        return "forbidden";
      case "invalid_input":
        return "invalid_input";
      case "git_failed":
        return "git_failed";
      default:
        return "unknown";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const result = await saveWikiPage({
        workspaceId,
        pageSlug,
        markdown: draft.markdown,
        frontmatter: draft.frontmatter as Record<string, unknown>,
      });
      if (result.ok) {
        setStatus({ kind: "ok", sha: result.sha.slice(0, 7) });
        router.refresh();
      } else {
        setStatus({ kind: "err", reason: errorReason(result.error) });
      }
    } catch (err) {
      console.error("[wiki:manual:save] unexpected error:", err);
      setStatus({ kind: "err", reason: "unknown" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <WikiEditor
        initialContent={initialContent}
        onChange={handleChange}
        pageSlug={pageSlug}
        workspaceId={workspaceId}
      />
      <div className="flex items-center justify-end gap-3">
        {status.kind === "ok" && (
          <span className="text-sm text-green-700" role="status">
            {t("saveSuccess", { sha: status.sha })}
          </span>
        )}
        {status.kind === "err" && (
          <span className="text-sm text-red-600" role="alert">
            {t("saveFailed", { reason: status.reason })}
          </span>
        )}
        <Button onClick={handleSave} disabled={saving} data-testid="wiki-save-button">
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
