import { DataGrid } from "@/components/grid/DataGrid";
import { formatDateTimeKst } from "@/lib/format-date-time";

type Row = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export function AuditGridContainer(props: { initialRows: Row[]; total: number }) {
  return (
    <DataGrid
      rows={props.initialRows.map((row) => ({ ...row, createdAt: formatDateTimeKst(row.createdAt) }))}
      columns={[
        { key: "createdAt", header: "시각", type: "readonly" },
        { key: "action", header: "작업", type: "readonly" },
        { key: "resourceType", header: "리소스", type: "readonly" },
        { key: "resourceId", header: "리소스 ID", type: "readonly" },
        { key: "success", header: "결과", type: "readonly", render: (row) => (row.success ? "성공" : "실패") },
      ]}
    />
  );
}
