import { DataGrid } from "@/components/grid/DataGrid";
import { formatDateTimeKst } from "@/lib/format-date-time";

type Row = {
  id: string;
  createdAt: string;
  route: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
};

export function LlmUsageGridContainer(props: { initialRows: Row[]; total: number }) {
  return (
    <DataGrid
      rows={props.initialRows.map((row) => ({ ...row, createdAt: formatDateTimeKst(row.createdAt) }))}
      columns={[
        { key: "createdAt", header: "시각", type: "readonly" },
        { key: "route", header: "경로", type: "readonly" },
        { key: "model", header: "모델", type: "readonly" },
        { key: "promptTokens", header: "입력 토큰", type: "readonly" },
        { key: "completionTokens", header: "출력 토큰", type: "readonly" },
        { key: "totalTokens", header: "총 토큰", type: "readonly" },
        { key: "costUsd", header: "비용(USD)", type: "readonly" },
      ]}
    />
  );
}
