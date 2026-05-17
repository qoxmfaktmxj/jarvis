"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/RichTextEditor";

// Step 2D (2026-05-11): raw_source.sensitivity 제거 (D2=B) — sensitivity 선택 UI 삭제.

const CONTENT_MAX_BYTES = 200_000;

export function ManualIngestForm() {
  const t = useTranslations("WikiIngest.manual");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [authorNote, setAuthorNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ rawSourceId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(t("errors.titleRequired"));
      return;
    }
    if (!content.trim()) {
      setError(t("errors.contentRequired"));
      return;
    }
    // Byte-size guard (UTF-8 encoded) — parallels server-side 200_000 chars cap
    const byteLen = new TextEncoder().encode(content).length;
    if (byteLen > CONTENT_MAX_BYTES) {
      setError(t("errors.contentTooLarge"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/raw-source/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          authorNote: authorNote.trim() ? authorNote : undefined,
        }),
      });
      if (!res.ok) throw new Error("submit_failed");
      const data = (await res.json()) as { rawSourceId: string };
      setResult(data);
    } catch {
      setError(t("errors.submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-1">
        <p className="text-sm font-medium text-green-900">
          {t("result.success", { id: result.rawSourceId })}
        </p>
        <p className="text-xs text-muted-foreground">{t("result.pendingJob")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="manual-ingest-title">{t("form.titleLabel")}</Label>
        <Input
          id="manual-ingest-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("form.titlePlaceholder")}
          maxLength={500}
          disabled={loading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>{t("form.contentLabel")}</Label>
        <RichTextEditor
          value={content}
          onChange={setContent}
          output="markdown"
          readOnly={loading}
          minHeight="280px"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-ingest-note">
          {t("form.authorNoteLabel")}
        </Label>
        <Textarea
          id="manual-ingest-note"
          value={authorNote}
          onChange={(e) => setAuthorNote(e.target.value)}
          placeholder={t("form.authorNoteHelp")}
          maxLength={2000}
          rows={3}
          disabled={loading}
        />
      </div>

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? t("form.submitting") : t("form.submit")}
      </Button>
    </form>
  );
}
