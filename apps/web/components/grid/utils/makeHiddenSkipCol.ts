export type ExportableColumn = {
  key: string;
  header: string;
  hidden?: boolean;
};

export function makeHiddenSkipCol<T extends ExportableColumn>(
  cols: readonly T[],
): T[] {
  return cols.filter((c) => !c.hidden);
}
