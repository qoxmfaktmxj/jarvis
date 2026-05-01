// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWorkspaceHolidays, __resetHolidayCache } from "../useWorkspaceHolidays";

describe("useWorkspaceHolidays", () => {
  beforeEach(() => {
    __resetHolidayCache();
    vi.restoreAllMocks();
  });

  it("fetches range when not cached", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ holidays: [{ date: "2026-05-05", name: "어린이날", note: null }] }), { status: 200 }),
    );
    const { result } = renderHook(() => useWorkspaceHolidays(2026, 4));
    await waitFor(() => expect(result.current.holidaysByDate.size).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.holidaysByDate.get("2026-05-05")).toEqual({ name: "어린이날", note: null });
  });

  it("does not refetch the same month twice", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ holidays: [] }), { status: 200 }),
    );
    const { result, rerender } = renderHook(
      ({ y, m }: { y: number; m: number }) => useWorkspaceHolidays(y, m),
      { initialProps: { y: 2026, m: 4 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ y: 2026, m: 4 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fetches a different month separately", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ holidays: [] }), { status: 200 }),
    );
    const { rerender } = renderHook(
      ({ y, m }: { y: number; m: number }) => useWorkspaceHolidays(y, m),
      { initialProps: { y: 2026, m: 4 } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ y: 2026, m: 5 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
