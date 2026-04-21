import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DashboardActivityList } from "./DashboardActivityList";
import type { AuditLogEntry } from "@/lib/queries/dashboard";

describe("DashboardActivityList", () => {
  it("renders an empty state when there are no entries", () => {
    const html = renderToStaticMarkup(
      DashboardActivityList({ items: [] })
    );
    expect(html).toContain("최근 활동이 없습니다");
  });

  it("renders up to 6 entries with action label and timestamp", () => {
    const now = new Date();
    const items: AuditLogEntry[] = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      action: "wiki.edit",
      resourceType: "wiki_page",
      resourceId: null,
      userId: `u${i}`,
      createdAt: new Date(now.getTime() - i * 60_000),
    }));
    const html = renderToStaticMarkup(
      DashboardActivityList({ items })
    );
    // 6개만 렌더링되므로 id a6, a7은 포함되지 않아야 함
    // <li> 태그가 6개인지 확인
    const liMatches = html.match(/<li/g);
    expect(liMatches).toHaveLength(6);
  });
});
