import { describe, it, expect, vi } from "vitest";
import { fetchIncidents } from "./sd-api-client.js";

describe("fetchIncidents", () => {
  it("calls correct URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ enter_cd: "100", title: "x" }],
    });
    global.fetch = fetchMock as any;

    const result = await fetchIncidents({ higherCd: "H008", yyyy: "2026", mm: "03" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://sd.isusystem.co.kr/api/incidents_low?higher_cd=H008&yyyy=2026&mm=03",
      expect.any(Object)
    );
    expect(result).toEqual([{ enter_cd: "100", title: "x" }]);
  });

  it("throws on non-2xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await expect(fetchIncidents({ higherCd: "H008", yyyy: "2026", mm: "03" }))
      .rejects.toThrow(/500/);
  });
});
