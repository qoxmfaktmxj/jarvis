import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DashboardQuickQuestions } from "./DashboardQuickQuestions";
import type { TrendItem } from "@/lib/queries/dashboard";

describe("DashboardQuickQuestions", () => {
  it("renders fallback questions when trends are empty", () => {
    const html = renderToStaticMarkup(
      DashboardQuickQuestions({ trends: [] })
    );
    // fallback 링크가 하나 이상 있어야 함
    const linkMatches = html.match(/<a /g);
    expect(linkMatches).not.toBeNull();
    expect((linkMatches ?? []).length).toBeGreaterThan(0);
  });

  it("uses trending queries as quick questions", () => {
    const trends: TrendItem[] = [
      { query: "이번 주 주요 결정 사항", count: 12 },
      { query: "사내 VPN 접속 방법", count: 9 },
    ];
    const html = renderToStaticMarkup(
      DashboardQuickQuestions({ trends })
    );
    expect(html).toContain("이번 주 주요 결정 사항");
    expect(html).toContain("사내 VPN 접속 방법");
  });
});
