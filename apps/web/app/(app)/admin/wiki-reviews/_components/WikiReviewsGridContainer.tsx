"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { resolveWikiReviewAction } from "../actions";

type Row = {
  id: string;
  kind: "contradiction" | "citation_validation" | "lint" | "integrity_violation" | "ingest_failure";
  status: "pending" | "in_review" | "resolved" | "dismissed";
  description: string;
  sourceRevisionId: string | null;
  affectedPages: string[];
  createdAt: string;
  updatedAt: string;
};

export function WikiReviewsGridContainer(props: { initialRows: Row[]; total: number }) {
  const [rows, setRows] = useState(props.initialRows);

  async function updateStatus(row: Row, status: Row["status"]) {
    const result = await resolveWikiReviewAction({ reviewId: row.id, status });
    setRows((current) => current.map((item) => (
      item.id === result.reviewId ? { ...item, status: result.status } : item
    )));
  }

  return (
    <DataGrid
      rows={rows}
      columns={[
        { key: "kind", header: "검토 유형", type: "readonly" },
        { key: "status", header: "상태", type: "readonly" },
        { key: "description", header: "설명", type: "readonly" },
        { key: "createdAt", header: "생성 시각", type: "readonly" },
      ]}
      rowActions={(row) => (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void updateStatus(row, "resolved")}>
            해결
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void updateStatus(row, "in_review")}>
            다시 열기
          </Button>
        </div>
      )}
    />
  );
}
