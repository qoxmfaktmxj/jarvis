import type { ReactNode } from "react";

export type GridColumn<Row> = {
  key: keyof Row & string;
  header: string;
  type: "text" | "textarea" | "select" | "boolean" | "numeric" | "readonly";
  widthClassName?: string;
  options?: ReadonlyArray<{ label: string; value: string }>;
  render?: (row: Row) => ReactNode;
};

export type GridRowStatus = "clean" | "new" | "dirty" | "deleted";

export type GridRow<Row> = Row & { _status?: GridRowStatus };
