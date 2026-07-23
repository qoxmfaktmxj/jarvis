"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTimeKst } from "@/lib/format-date-time";
import { isAllowedOfficialUrl } from "@/lib/official-links";
import { getSourcePreviewAction, queueSourceIngestAction } from "../actions";

type Row = {
  id: string;
  provider: string;
  externalId: string;
  title: string;
  sourceType: "law" | "case" | "interpretation" | "guide";
  latestRevisionId: string | null;
  parseStatus: "pending" | "parsed" | "failed";
  retrievedAt: string;
  stalePageCount: number;
  linkedWikiPageCount: number;
};

type Preview = {
  title: string;
  canonicalUrl: string;
  sourceType: Row["sourceType"];
  revisionKey: string;
  effectiveFrom: string | null;
  retrievedAt: string;
  content: string;
  truncated: boolean;
  wikiPages: Array<{ title: string; path: string }>;
};

export function SourcesGridContainer(props: { initialRows: Row[]; total: number }) {
  const t = useTranslations("Admin.Sources");
  const [providerId, setProviderId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  async function queueIngest() {
    const result = await queueSourceIngestAction({ providerId, externalId });
    setMessage(t("queueSuccess", { jobId: result.jobId }));
  }

  async function openPreview(id: string) {
    setPreview(null);
    setPreviewFailed(false);
    const result = await getSourcePreviewAction({ id });
    if (!result.ok || !result.preview) {
      setPreviewFailed(true);
      return;
    }
    setPreview(result.preview);
  }

  return (
    <div className="space-y-4">
      <DataGridToolbar>
        <GridSearchForm />
        <input value={providerId} onChange={(event) => setProviderId(event.target.value)} placeholder={t("providerPlaceholder")} className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <input value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder={t("externalIdPlaceholder")} className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <Button onClick={() => void queueIngest()}>{t("queueIngest")}</Button>
      </DataGridToolbar>
      {message ? <p className="text-sm text-[var(--fg-secondary)]">{message}</p> : null}
      <DataGrid
        rows={props.initialRows}
        columns={[
          { key: "provider", header: t("provider"), type: "readonly" },
          { key: "title", header: t("documentTitle"), type: "readonly" },
          { key: "sourceType", header: t("sourceType"), type: "readonly" },
          { key: "parseStatus", header: t("status"), type: "readonly", render: (row) => t(`statusLabels.${row.parseStatus}`) },
          { key: "retrievedAt", header: t("retrievedAt"), type: "readonly", render: (row) => formatDateTimeKst(row.retrievedAt) },
          { key: "linkedWikiPageCount", header: t("linkedWikiPages"), type: "readonly", render: (row) => t("linkedWikiCount", { count: row.linkedWikiPageCount }) },
        ]}
        rowActions={(row) => <Button size="sm" variant="secondary" onClick={() => void openPreview(row.id)}>{t("viewDocument")}</Button>}
      />

      <Dialog open={preview !== null || previewFailed} onOpenChange={(open) => !open && (setPreview(null), setPreviewFailed(false))}>
        <DialogContent className="w-[min(94vw,64rem)]">
          {previewFailed ? <p role="alert" className="text-sm text-[var(--fg-secondary)]">{t("previewFailed")}</p> : null}
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>{preview.title}</DialogTitle>
                <DialogDescription>{t("previewDescription")}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-3 text-sm text-[var(--fg-secondary)] md:grid-cols-2">
                <p>{t("retrievedAt")}: {formatDateTimeKst(preview.retrievedAt)}</p>
                <p>{t("linkedWikiCount", { count: preview.wikiPages.length })}</p>
              </div>
              {isAllowedOfficialUrl(preview.canonicalUrl) ? <a href={preview.canonicalUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-medium text-[var(--brand-primary)] underline">{t("openOfficial")}</a> : null}
              {preview.wikiPages.length > 0 ? (
                <div className="mt-4 border-t border-[var(--border-default)] pt-4">
                  <p className="text-sm font-medium text-[var(--fg-primary)]">{t("linkedWikiTitle")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {preview.wikiPages.map((page) => <Link key={page.path} href={`/wiki/${page.path.replace(/\.md$/, "")}`} className="rounded-md border border-[var(--border-default)] px-2 py-1 text-sm text-[var(--brand-primary)] hover:bg-[var(--bg-surface)]">{page.title}</Link>)}
                  </div>
                </div>
              ) : null}
              <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-xs leading-5 text-[var(--fg-primary)]">{preview.content}{preview.truncated ? `\n\n${t("previewTruncated")}` : ""}</pre>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
