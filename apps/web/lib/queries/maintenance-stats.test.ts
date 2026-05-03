import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import {
  getStatsByGroupingSet,
  getStatsCombined,
} from "./maintenance-stats";
import { db } from "@jarvis/db/client";

vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      queryChunks: strings,
      params: values,
    }),
    { empty: vi.fn(), raw: vi.fn() },
  ),
}));

const BASE_INPUT = {
  workspaceId: "ws-1",
  yyyymmFrom: "202401",
  yyyymmTo: "202412",
  categories: ["CAT_A", "CAT_B"],
  cntRatio: 40,
};

describe("getStatsByGroupingSet", () => {
  beforeEach(() => {
    (db.execute as Mock).mockReset();
  });

  it("calls db.execute and splits rows by bucket", async () => {
    (db.execute as Mock).mockResolvedValue({
      rows: [
        {
          bucket: "company",
          label: "ACME Corp",
          cnt: 10,
          work_time: 5.5,
          ranking_time: 1,
          ranking_cnt: 2,
          final_rank: 1,
        },
        {
          bucket: "manager",
          label: "김철수",
          cnt: 7,
          work_time: 3.0,
          ranking_time: 1,
          ranking_cnt: 1,
          final_rank: 1,
        },
      ],
    });

    const result = await getStatsByGroupingSet(BASE_INPUT);

    expect(db.execute).toHaveBeenCalledOnce();

    expect(result.byCompany).toHaveLength(1);
    expect(result.byCompany[0]).toEqual({
      label: "ACME Corp",
      cnt: 10,
      workTime: 5.5,
      rankingTime: 1,
      rankingCnt: 2,
      finalRank: 1,
    });

    expect(result.byManager).toHaveLength(1);
    expect(result.byManager[0]).toEqual({
      label: "김철수",
      cnt: 7,
      workTime: 3.0,
      rankingTime: 1,
      rankingCnt: 1,
      finalRank: 1,
    });
  });

  it("handles empty result set", async () => {
    (db.execute as Mock).mockResolvedValue({ rows: [] });
    const result = await getStatsByGroupingSet(BASE_INPUT);
    expect(result.byCompany).toHaveLength(0);
    expect(result.byManager).toHaveLength(0);
  });

  it("coerces null/undefined numeric fields to 0", async () => {
    (db.execute as Mock).mockResolvedValue({
      rows: [
        {
          bucket: "company",
          label: "X",
          cnt: null,
          work_time: undefined,
          ranking_time: null,
          ranking_cnt: null,
          final_rank: null,
        },
      ],
    });
    const result = await getStatsByGroupingSet(BASE_INPUT);
    expect(result.byCompany[0].cnt).toBe(0);
    expect(result.byCompany[0].workTime).toBe(0);
  });
});

describe("getStatsCombined", () => {
  beforeEach(() => {
    (db.execute as Mock).mockReset();
  });

  it("maps all fields correctly including null requestCompanyNm for subtotal row", async () => {
    (db.execute as Mock).mockResolvedValue({
      rows: [
        {
          manager_nm: "김철수",
          request_company_nm: null,
          cnt: 15,
          work_time: 8.0,
          total: 6.4,
          final_rank: 1,
        },
        {
          manager_nm: "김철수",
          request_company_nm: "ACME Corp",
          cnt: 10,
          work_time: 5.0,
          total: 4.0,
          final_rank: 1,
        },
      ],
    });

    const result = await getStatsCombined(BASE_INPUT);

    expect(db.execute).toHaveBeenCalledOnce();
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      managerNm: "김철수",
      requestCompanyNm: null,
      cnt: 15,
      workTime: 8.0,
      total: 6.4,
      finalRank: 1,
    });

    expect(result[1]).toEqual({
      managerNm: "김철수",
      requestCompanyNm: "ACME Corp",
      cnt: 10,
      workTime: 5.0,
      total: 4.0,
      finalRank: 1,
    });
  });

  it("handles empty result set", async () => {
    (db.execute as Mock).mockResolvedValue({ rows: [] });
    const result = await getStatsCombined(BASE_INPUT);
    expect(result).toHaveLength(0);
  });
});
