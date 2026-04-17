import type { ReactNode } from "react";

export type TimelineItemProps = {
  time: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneDots: Record<NonNullable<TimelineItemProps["tone"]>, string> = {
  default: "bg-isu-500",
  success: "bg-lime-500",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function TimelineItem({ time, title, description, meta, tone = "default" }: TimelineItemProps) {
  return (
    <li className="relative grid grid-cols-[4.25rem_1fr] gap-4">
      <time className="text-display pt-0.5 text-right text-xs tabular-nums text-surface-400">
        {time}
      </time>
      <div className="relative">
        <span
          className={`absolute -left-[1.0625rem] top-1.5 h-1.5 w-1.5 rounded-full ${toneDots[tone]} ring-4 ring-white`}
          aria-hidden
        />
        <p className="text-display text-sm font-semibold uppercase tracking-wide text-surface-700">
          {title}
        </p>
        {description ? <p className="text-sm text-surface-500">{description}</p> : null}
        {meta ? <p className="mt-1 text-xs text-surface-400">{meta}</p> : null}
      </div>
    </li>
  );
}
