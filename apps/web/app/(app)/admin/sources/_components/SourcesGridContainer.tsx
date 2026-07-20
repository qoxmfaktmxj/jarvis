"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { DataGridToolbar } from "@/components/grid/DataGridToolbar";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { queueSourceIngestAction } from "../actions";

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
};

export function SourcesGridContainer(props: { initialRows: Row[]; total: number }) {
  const [providerId, setProviderId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function queueIngest() {
    const result = await queueSourceIngestAction({ providerId, externalId });
    setMessage(`수집 작업이 예약되었습니다: ${result.jobId}`);
  }

  return (
    <div className="space-y-4">
      <DataGridToolbar>
        <GridSearchForm />
        <input value={providerId} onChange={(event) => setProviderId(event.target.value)} placeholder="provider" className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <input value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="externalId" className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <Button onClick={() => void queueIngest()}>수집 예약</Button>
      </DataGridToolbar>
      {message ? <p className="text-sm text-[var(--fg-secondary)]">{message}</p> : null}
      <DataGrid
        rows={props.initialRows}
        columns={[
          { key: "provider", header: "제공처", type: "readonly" },
          { key: "externalId", header: "외부 ID", type: "readonly" },
          { key: "title", header: "문서명", type: "readonly" },
          { key: "sourceType", header: "문서 유형", type: "readonly" },
          { key: "latestRevisionId", header: "최신 revision", type: "readonly" },
          { key: "parseStatus", header: "상태", type: "readonly" },
          { key: "stalePageCount", header: "오래된 페이지 수", type: "readonly" },
        ]}
      />
    </div>
  );
}
