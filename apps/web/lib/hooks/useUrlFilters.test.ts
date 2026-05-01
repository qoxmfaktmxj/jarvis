// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useUrlFilters } from "./useUrlFilters";

const replaceMock = vi.fn();
let currentSearch = "custNm=acme&page=1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => "/sales/customers",
}));

describe("useUrlFilters", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    currentSearch = "custNm=acme&page=1";
  });

  it("reads initial values from URL searchParams", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "", page: "1" } }),
    );
    expect(result.current.values).toEqual({ custNm: "acme", page: "1" });
  });

  it("falls back to defaults when param missing in URL", () => {
    currentSearch = "page=1";
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "default", page: "1" } }),
    );
    expect(result.current.values.custNm).toBe("default");
  });

  it("setValue pushes new value to URL via router.replace with scroll:false", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "" } }),
    );
    act(() => {
      result.current.setValue("custNm", "globex");
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [url, opts] = replaceMock.mock.calls[0]!;
    expect(url).toContain("custNm=globex");
    expect(url).toMatch(/^\/sales\/customers\?/);
    expect(opts).toEqual({ scroll: false });
  });

  it("setValue with empty string removes the param from URL", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "" } }),
    );
    act(() => {
      result.current.setValue("custNm", "");
    });
    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).not.toContain("custNm=");
  });

  it("reset writes defaults back to URL", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "", page: "1" } }),
    );
    act(() => {
      result.current.reset();
    });
    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("page=1");
    expect(url).not.toContain("custNm=");
  });

  it("setValue calls in same tick compose, not clobber (regression I-1)", () => {
    currentSearch = "";
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { a: "", b: "" } }),
    );
    act(() => {
      result.current.setValue("a", "x");
      result.current.setValue("b", "y");
    });
    expect(replaceMock).toHaveBeenCalledTimes(2);
    const lastUrl = replaceMock.mock.calls.at(-1)?.[0] as string;
    expect(lastUrl).toContain("a=x");
    expect(lastUrl).toContain("b=y");
  });
});
