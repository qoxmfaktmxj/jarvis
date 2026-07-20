import type { ReactNode } from "react";
import type { GridColumn } from "./types";

export function DataGrid<Row extends { id: string }>(props: {
  columns: Array<GridColumn<Row>>;
  rows: Row[];
  emptyText?: string;
  rowActions?: (row: Row) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] shadow-[var(--shadow-soft)]">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-[var(--bg-surface)]">
          <tr>
            {props.columns.map((column) => (
              <th key={column.key} className={`border-b border-[var(--border-default)] px-3 py-2 text-left font-medium ${column.widthClassName ?? ""}`}>
                {column.header}
              </th>
            ))}
            {props.rowActions ? <th className="border-b border-[var(--border-default)] px-3 py-2 text-left font-medium">관리</th> : null}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.columns.length + (props.rowActions ? 1 : 0)} className="px-3 py-8 text-center text-[var(--fg-secondary)]">
                {props.emptyText ?? "표시할 데이터가 없습니다."}
              </td>
            </tr>
          ) : (
            props.rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border-default)] last:border-b-0">
                {props.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 align-top">
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
                  </td>
                ))}
                {props.rowActions ? <td className="px-3 py-2">{props.rowActions(row)}</td> : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
