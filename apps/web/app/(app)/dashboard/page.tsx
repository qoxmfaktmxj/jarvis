import Link from "next/link";
import { getDashboardData } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { isoWeekNumber } from "@/lib/date-utils";
import { PageHeader } from "@/components/patterns/PageHeader";
import { KpiTile } from "@/components/patterns/KpiTile";
import { RefreshCw, MessageSquare, ChevronRight, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

// Hardcoded per app.jsx (design prototype). i18n keys can be added when the
// final layout stabilises; for now we mirror the prototype 1:1.
const ACTIVITY_FEED: Array<[string, string, string, string, "mint" | "accent" | "amber" | "neutral"]> = [
  ["김지훈", "커밋", "tsvd999 · 대시보드 통합", "12m", "mint"],
  ["이수민", "편집", "위키 · 온보딩 가이드 v3", "34m", "accent"],
  ["박서준", "질문", "Jarvis · 백업 주기", "1h", "amber"],
  ["최유진", "리뷰 요청", "PR #482", "2h", "neutral"],
  ["정다빈", "편집", "위키 · HR 정책 2026 Q2", "3h", "accent"],
  ["강민호", "커밋", "wiki-agent · embeddings", "5h", "mint"],
];

const QUICK_QUESTIONS = [
  "이번 주 주요 결정 사항",
  "진행 지연 중인 프로젝트",
  "이번 분기 채용 현황",
  "사내 VPN 접속 방법",
];

const TONE_COLOR: Record<"mint" | "accent" | "amber" | "neutral", string> = {
  mint: "var(--mint)",
  accent: "var(--accent)",
  amber: "var(--amber, var(--accent))",
  neutral: "var(--muted)",
};

export default async function DashboardPage() {
  const session = await requirePageSession();

  // Existing server data is still fetched so permission checks and audit
  // trails run. The new prototype layout uses design-locked sample numbers
  // (per the app.jsx spec); when the real design ships we'll wire `data`
  // into the tiles.
  await getDashboardData(
    session.workspaceId,
    session.userId,
    session.roles,
    session.permissions
  );

  const week = isoWeekNumber(new Date());

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1320, margin: "0 auto" }}>
      <PageHeader
        stamp={`W${week}`}
        kicker="Dashboard"
        title="대시보드"
        subtitle="관리자님, 반갑습니다. 이번 주 워크스페이스 스냅샷입니다."
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

      {/* KPI 4-tile */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiTile
          label="금주 휴가 인원"
          value="6"
          delta="+2"
          trend={[2, 3, 3, 4, 5, 6, 5, 4, 6, 6, 7, 6]}
          tone="mint"
        />
        <KpiTile
          label="진행 중 프로젝트"
          value="7"
          delta="+2"
          trend={[3, 3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7]}
          tone="accent"
        />
        <KpiTile
          label="위키 인용"
          value="4,920"
          delta="+412"
          trend={[30, 42, 38, 55, 60, 58, 70, 78, 82, 90, 95, 100]}
          tone="neutral"
        />
        <KpiTile
          label="AI 질의"
          value="1,284"
          delta="+180"
          trend={[10, 14, 18, 16, 22, 28, 32, 40, 44, 50, 60, 72]}
          tone="neutral"
        />
      </div>

      {/* Row: Recent activity (2fr) · Quick questions (1fr) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Recent activity */}
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>최근 활동</div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {(["7일", "30일", "분기"] as const).map((label, i) => (
                <span key={label} className="mono" style={chipStyle(i === 1 ? "accent" : "neutral")}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ padding: "6px 20px 20px" }}>
            {ACTIVITY_FEED.map(([who, kind, target, when, tone], i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--line2)",
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 99,
                    background: "var(--line2)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink2)",
                  }}
                >
                  {who[0]}
                </div>
                <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>{who}</span>
                  <span style={{ color: "var(--muted)" }}> {kind} </span>
                  <span>{target}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: TONE_COLOR[tone],
                    }}
                  />
                  <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                    {when}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick questions */}
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--line2)",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>빠른 질문</div>
            <span className="mono" style={{ ...chipStyle("mint"), marginLeft: "auto" }}>
              AI
            </span>
          </div>
          <div style={{ padding: "6px 20px 20px" }}>
            {QUICK_QUESTIONS.map((q) => (
              <Link
                key={q}
                href="/ask"
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--panel)",
                  marginBottom: 8,
                  color: "var(--ink)",
                  textDecoration: "none",
                }}
              >
                <span style={{ color: "var(--muted)", display: "inline-flex" }}>
                  <MessageSquare size={16} />
                </span>
                <span style={{ flex: 1 }}>{q}</span>
                <span style={{ color: "var(--faint)", display: "inline-flex" }}>
                  <ChevronRight size={16} />
                </span>
              </Link>
            ))}
            <Link
              href="/ask"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontWeight: 500,
                fontSize: 13.5,
                padding: "7px 12px",
                borderRadius: 8,
                background: "var(--panel)",
                border: "1px solid var(--line)",
                color: "var(--ink2)",
                width: "100%",
                marginTop: 4,
                textDecoration: "none",
              }}
            >
              <Sparkles size={16} />
              새 질문 시작
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function chipStyle(
  tone: "neutral" | "accent" | "mint" | "amber"
): React.CSSProperties {
  const palette = {
    neutral: { bg: "var(--line2)", fg: "var(--ink2)" },
    accent: { bg: "var(--accent-tint)", fg: "var(--accent-ink)" },
    mint: { bg: "var(--mint-tint)", fg: "var(--mint)" },
    amber: { bg: "var(--amber-tint, var(--accent-tint))", fg: "var(--amber, var(--accent))" },
  }[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    fontSize: 10.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    background: palette.bg,
    color: palette.fg,
    borderRadius: 4,
  };
}
