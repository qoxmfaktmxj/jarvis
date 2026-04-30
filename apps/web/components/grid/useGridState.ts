"use client";
/**
 * apps/web/components/grid/useGridState.ts
 *
 * 공통 그리드 행 상태 훅.
 * 기존 apps/web/app/(app)/admin/companies/_components/useCompaniesGridState.ts
 * 에서 추출·일반화. 의미론적으로 동일한 API를 유지하되 generic <T>.
 */
import { useCallback, useMemo, useState } from "react";
import type { RowStatus, GridChanges } from "./types";

export type GridRow<T extends { id: string }> = {
  data: T;
  state: RowStatus;
  original?: T;
};

export function useGridState<T extends { id: string }>(initial: T[]) {
  const [rows, setRows] = useState<GridRow<T>[]>(() =>
    initial.map((d) => ({ data: d, state: "clean" as const })),
  );

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
        const next = { ...r.data, [key]: value };
        if (r.state === "new") return { ...r, data: next };
        const original = r.original ?? r.data;
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

  const toBatch = useCallback((): GridChanges<T> => {
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
          if ((r.data as Record<string, unknown>)[k] !== (original as Record<string, unknown>)[k]) {
            (patch as Record<string, unknown>)[k] = (r.data as Record<string, unknown>)[k];
          }
        }
        updates.push({ id: r.data.id, patch });
      } else if (r.state === "deleted") {
        deletes.push(r.data.id);
      }
    }

    return { creates, updates, deletes };
  }, [rows]);

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
