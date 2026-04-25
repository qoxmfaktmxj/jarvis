import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-[--bg-surface] px-6 py-16 text-center">
      {Icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[--brand-primary-bg]">
          <Icon className="h-6 w-6 text-[--brand-primary-text]" aria-hidden />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-display text-lg font-semibold tracking-tight text-[--fg-primary]">
          {title}
        </h3>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-[--fg-secondary]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
