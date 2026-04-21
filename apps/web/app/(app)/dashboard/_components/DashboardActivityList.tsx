import type { AuditLogEntry } from "@/lib/queries/dashboard";

const ACTION_LABELS: Record<string, string> = {
  "wiki.edit": "위키 편집",
  "wiki.publish": "위키 게시",
  "ask.query": "AI 질문",
  "contractor.create": "외주 등록",
  "holiday.update": "공휴일 변경",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatRelative(from: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - from.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function DashboardActivityList({ items }: { items: AuditLogEntry[] }) {
  if (items.length === 0) {
    return (
      <p style={{ padding: "24px 20px", fontSize: 13, color: "var(--muted)" }}>
        최근 활동이 없습니다.
      </p>
    );
  }

  const visible = items.slice(0, 6);
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "6px 20px 20px" }}>
      {visible.map((item) => (
        <li
          key={item.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "10px 0",
            borderBottom: "1px solid var(--line2)",
          }}
        >
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: "var(--muted)" }}>{formatAction(item.action)}</span>
            <span> · {item.resourceType}</span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
            {formatRelative(item.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
