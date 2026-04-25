import type { ReactNode } from "react";

export type TimelineItemProps = {
  time: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneDots: Record<NonNullable<TimelineItemProps["tone"]>, string> = {
  default: "bg-[--brand-primary]",
  success: "bg-[--brand-primary]",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function TimelineItem({ time, title, description, meta, tone = "default" }: TimelineItemProps) {
  return (
    <li className="relative grid grid-cols-[4.25rem_1fr] gap-4">
      <time className="text-display pt-0.5 text-right text-xs tabular-nums text-[--fg-muted]">
        {time}
      </time>
      <div className="relative">
        <span
          className={`absolute -left-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full ${toneDots[tone]} ring-4 ring-white`}
          aria-hidden
        />
        <p className="text-display text-sm font-semibold uppercase tracking-wide text-[--fg-primary]">
          {title}
        </p>
        {description ? <p className="text-sm text-[--fg-secondary]">{description}</p> : null}
        {meta ? <p className="mt-1 text-xs text-[--fg-muted]">{meta}</p> : null}
      </div>
    </li>
  );
}
