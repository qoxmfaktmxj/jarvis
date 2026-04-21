import { getDashboardData } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { isoWeekNumber } from "@/lib/date-utils";
import { PageHeader } from "@/components/patterns/PageHeader";
import { KpiTile } from "@/components/patterns/KpiTile";
import { RefreshCw } from "lucide-react";
import { DashboardActivityList } from "./_components/DashboardActivityList";
import { DashboardQuickQuestions } from "./_components/DashboardQuickQuestions";

export const dynamic = "force-dynamic";

function activityLast24h(items: { createdAt: Date }[], now = new Date()): number {
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return items.filter((it) => it.createdAt.getTime() >= cutoff).length;
}

function trendingTotal(trends: { count: number }[]): number {
  return trends.reduce((sum, t) => sum + t.count, 0);
}

export default async function DashboardPage() {
  const session = await requirePageSession();
  const data = await getDashboardData(
    session.workspaceId,
    session.userId,
    session.roles,
    session.permissions
  );

  const week = isoWeekNumber(new Date());
  const stalePages = data.stalePages.length;
  const activityCount = activityLast24h(data.recentActivity);
  const trendsTotal = trendingTotal(data.searchTrends);
  const quickLinks = data.quickLinks.length;

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1320, margin: "0 auto" }}>
      <PageHeader
        stamp={`W${week}`}
        kicker="Dashboard"
        title="대시보드"
        subtitle={`${session.name}님, 반갑습니다. 이번 주 워크스페이스 스냅샷입니다.`}
        actions={
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13.5,
              fontWeight: 500,
              padding: "7px 12px",
              borderRadius: 8,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              color: "var(--ink2)",
            }}
          >
            <RefreshCw size={16} />
            새로고침
          </button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiTile
          label="점검 필요 위키"
          value={String(stalePages)}
          delta={stalePages === 0 ? "OK" : `+${stalePages}`}
          trend={[]}
          tone={stalePages === 0 ? "mint" : "amber"}
        />
        <KpiTile
          label="최근 24시간 활동"
          value={String(activityCount)}
          delta=""
          trend={[]}
          tone="accent"
        />
        <KpiTile
          label="이번 주 인기 검색"
          value={String(trendsTotal)}
          delta=""
          trend={[]}
          tone="neutral"
        />
        <KpiTile
          label="빠른 링크"
          value={String(quickLinks)}
          delta=""
          trend={[]}
          tone="neutral"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 0,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>최근 활동</div>
          </header>
          <DashboardActivityList items={data.recentActivity} />
        </section>

        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 0,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>빠른 질문</div>
          </header>
          <DashboardQuickQuestions trends={data.searchTrends} />
        </section>
      </div>
    </div>
  );
}
