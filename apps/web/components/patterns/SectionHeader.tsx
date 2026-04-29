import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title: string;
  children?: ReactNode;
  as?: "h2" | "h3";
};

export function SectionHeader({ title, children, as: As = "h2" }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <As className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-(--fg-secondary)">
        {title}
      </As>
      <span className="h-px flex-1 bg-(--border-default)" aria-hidden />
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
