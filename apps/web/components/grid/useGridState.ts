"use client";
/**
 * apps/web/components/grid/useGridState.ts
 *
 * 공통 그리드 행 상태 훅.
 * 기존 apps/web/app/(app)/admin/companies/_components/useCompaniesGridState.ts
 * 에서 추출·일반화. 의미론적으로 동일한 API를 유지하되 generic <T>.
 *
 * Tab integration: 옵션으로 `initialRows` (외부 캐시에서 복구할 시작 상태)와
 * `onRowsChange` (rows 변경 시 외부에 통지) 를 지원해 탭 전환 사이에 dirty/new/
 * deleted 행이 보존되도록 한다. 미지정 시 기존 동작(`initial → clean` 변환)
 * 그대로.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RowStatus, GridChanges } from "./types";

export type GridRow<T extends { id: string }> = {
  data: T;
  state: RowStatus;
  original?: T;
};

/**
 * Compute a server-fresh + cached-state overlay. Server rows take priority for
 * "clean" identity, but cached `dirty`/`deleted` states (and the original
 * snapshot) are kept on top so user edits survive a refetch. Cached `new` rows
 * (not yet on server) are appended at the end.
 */
export function overlayGridRows<T extends { id: string }>(
  serverRows: T[],
  cachedRows: GridRow<T>[] | undefined,
): GridRow<T>[] {
  if (!cachedRows || cachedRows.length === 0) {
    return serverRows.map((d) => ({ data: d, state: "clean" as const }));
  }
  const cachedById = new Map(cachedRows.map((r) => [r.data.id, r]));
  const result: GridRow<T>[] = [];
  for (const sr of serverRows) {
    const cached = cachedById.get(sr.id);
    if (cached && (cached.state === "dirty" || cached.state === "deleted")) {
      result.push(cached);
    } else {
      result.push({ data: sr, state: "clean" });
    }
  }
  for (const cr of cachedRows) {
    if (cr.state === "new") result.push(cr);
  }
  return result;
}

/**
 * Build a `GridChanges` batch from a row state array. Pure function so caller
 * can construct save payloads without holding the hook (e.g. tab close save).
 */
export function rowsToBatch<T extends { id: string }>(
  rows: GridRow<T>[],
): GridChanges<T> {
  const creates: T[] = [];
  const updates: { id: string; patch: Partial<T> }[] = [];
  const deletes: string[] = [];
  for (const r of rows) {
    if (r.state === "new") {
      creates.push(r.data);
    } else if (r.state === "dirty") {
      const original = r.original ?? r.data;
      const patch: Partial<T> = {};
      for (const k in r.data) {
        if (
          (r.data as Record<string, unknown>)[k] !==
          (original as Record<string, unknown>)[k]
        ) {
          (patch as Record<string, unknown>)[k] = (r.data as Record<
            string,
            unknown
          >)[k];
        }
      }
      updates.push({ id: r.data.id, patch });
    } else if (r.state === "deleted") {
      deletes.push(r.data.id);
    }
  }
  return { creates, updates, deletes };
}

export interface UseGridStateOptions<T extends { id: string }> {
  /** Initial row state, e.g. restored from sessionStorage cache. Overrides
   *  the default `initial → clean` mapping. */
  initialRows?: GridRow<T>[];
  /** Fires whenever `rows` changes. Use to mirror state into TabContext. */
  onRowsChange?: (rows: GridRow<T>[]) => void;
}

export function useGridState<T extends { id: string }>(
  initial: T[],
  options?: UseGridStateOptions<T>,
) {
  const [rows, setRows] = useState<GridRow<T>[]>(
    () =>
      options?.initialRows ??
      initial.map((d) => ({ data: d, state: "clean" as const })),
  );

  // Notify caller when rows change (mirror to external store).
  const onRowsChange = options?.onRowsChange;
  useEffect(() => {
    if (onRowsChange) onRowsChange(rows);
  }, [rows, onRowsChange]);

  const reset = useCallback((next: T[]) => {
    setRows(next.map((d) => ({ data: d, state: "clean" as const })));
  }, []);

  const insertBlank = useCallback((blank: T) => {
    setRows((prev) => [{ data: blank, state: "new" }, ...prev]);
  }, []);

  const duplicate = useCallback((id: string, mut: (clone: T) => T) => {
    setRows((prev) => {
      const found = prev.find((r) => r.data.id === id);
      if (!found) return prev;
      return [{ data: mut(structuredClone(found.data)), state: "new" }, ...prev];
    });
  }, []);

  const update = useCallback(<K extends keyof T>(id: string, key: K, value: T[K]) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.data.id !== id) return r;
        // No-op: committing the same value (e.g. text cell blur with no edit)
        // must not transition clean → dirty.
        if (Object.is(r.data[key], value)) return r;
        const next = { ...r.data, [key]: value };
        if (r.state === "new") return { ...r, data: next };
        const original = r.original ?? r.data;
        // If the edit returns the row to its original value across all tracked
        // fields, drop back to clean and discard the snapshot. Without this,
        // A → A1 → A would remain marked "변경됨".
        const matchesOriginal = Object.keys(next as Record<string, unknown>).every((k) =>
          Object.is(
            (next as Record<string, unknown>)[k],
            (original as Record<string, unknown>)[k],
          ),
        );
        if (matchesOriginal) {
          const { original: _drop, ...rest } = r;
          return { ...rest, data: next, state: "clean" };
        }
        return { ...r, data: next, original, state: "dirty" };
      }),
    );
  }, []);

  const toggleDelete = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.data.id !== id) return r;
        if (r.state === "new") return r;
        if (r.state === "deleted") {
          return { ...r, state: r.original ? "dirty" : "clean" };
        }
        return { ...r, state: "deleted" };
      }),
    );
  }, []);

  const removeNew = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => !(r.data.id === id && r.state === "new")));
  }, []);

  const dirtyCount = useMemo(
    () => rows.filter((r) => r.state !== "clean").length,
    [rows],
  );

  const toBatch = useCallback((): GridChanges<T> => rowsToBatch(rows), [rows]);

  return {
    rows,
    reset,
    insertBlank,
    duplicate,
    update,
    toggleDelete,
    removeNew,
    dirtyCount,
    toBatch,
  };
}
