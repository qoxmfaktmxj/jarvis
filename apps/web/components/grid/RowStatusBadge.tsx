export function RowStatusBadge({ status }: { status?: "clean" | "new" | "dirty" | "deleted" }) {
  if (!status || status === "clean") return null;
  const label = status === "new" ? "입력" : status === "dirty" ? "수정" : "삭제";
  return (
    <span className="inline-flex rounded-full bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--fg-secondary)]">
      {label}
    </span>
  );
}
