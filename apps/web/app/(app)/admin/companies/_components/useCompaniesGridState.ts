"use client";
import { useCallback, useMemo, useState } from "react";

export type GridRowState = "clean" | "new" | "dirty" | "deleted";

export type GridRow<T extends { id: string }> = {
  data: T;
  state: GridRowState;
  original?: T;
};

export function useCompaniesGridState<T extends { id: string }>(initial: T[]) {
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

  const toBatch = useCallback(
    () => ({
      creates: rows.filter((r) => r.state === "new").map((r) => r.data),
      updates: rows.filter((r) => r.state === "dirty").map((r) => r.data),
      deletes: rows.filter((r) => r.state === "deleted").map((r) => r.data.id),
    }),
    [rows],
  );

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
