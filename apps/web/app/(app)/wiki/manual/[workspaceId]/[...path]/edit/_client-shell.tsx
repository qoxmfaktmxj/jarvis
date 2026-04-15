"use client";

/**
 * Client-side shell for the manual wiki edit page.
 * ----------------------------------------------------------------------------
 * Owns the WikiEditor dynamic import (Tiptap has browser-only APIs so ssr:false
 * is required — it must live in a Client Component, not the Server page).
 *
 * Phase-W2: replace `console.log` with a server action that writes back to
 *           git-backed `wiki/manual/**`.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Frontmatter } from "@/components/WikiEditor/FrontmatterPanel";

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

export default function EditPageClientShell({
  initialContent,
  workspaceId,
  pageSlug,
}: EditPageClientShellProps) {
  const t = useTranslations("WikiEditor");
  const [draft, setDraft] = useState<{ markdown: string; frontmatter: Frontmatter }>({
    markdown: initialContent,
    frontmatter: { title: "" },
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (markdown: string, frontmatter: Frontmatter) => {
    setDraft({ markdown, frontmatter });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Phase-W1 stub. Real save lands when the manual git-backed action ships.
      // eslint-disable-next-line no-console
      console.log("[wiki:manual:save]", {
        workspaceId,
        pageSlug,
        frontmatter: draft.frontmatter,
        markdownPreview: draft.markdown.slice(0, 200),
      });
      await new Promise((r) => setTimeout(r, 250));
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
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} data-testid="wiki-save-button">
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
