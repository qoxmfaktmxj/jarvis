import Link from "next/link";
import { MessageSquare, ChevronRight, Sparkles } from "lucide-react";
import type { TrendItem } from "@/lib/queries/dashboard";

const FALLBACK_QUESTIONS = [
  "이번 주 주요 결정 사항",
  "진행 지연 중인 프로젝트",
  "이번 분기 채용 현황",
  "사내 VPN 접속 방법",
];

export function DashboardQuickQuestions({ trends }: { trends: TrendItem[] }) {
  const questions =
    trends.length > 0
      ? trends.slice(0, 4).map((t) => t.query)
      : FALLBACK_QUESTIONS;

  return (
    <div style={{ padding: "6px 20px 20px" }}>
      {questions.map((q) => (
        <Link
          key={q}
          href={`/ask?q=${encodeURIComponent(q)}`}
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
  );
}
