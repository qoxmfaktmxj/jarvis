import type { JSX, ReactNode } from "react";

/**
 * PageHeader — title + actions only (kicker/subtitle removed 2026-05-12).
 *
 * Title is the single page identifier; subtitle/eyebrow rendering was dropped
 * to remove visual noise across every page. The deprecated props remain for
 * back-compat with existing call sites but are now no-ops — they accept the
 * value and discard it. New call sites should only pass `title` (and `actions`
 * if needed).
 */
export interface PageHeaderProps {
  /** Main title (30px bold). */
  title: string;
  /** Right-side action slot (buttons, links). */
  actions?: ReactNode;

  // ---- Deprecated, no-op (kept so existing call sites still compile) ------
  /** @deprecated No-op — kicker rendering removed. */
  kicker?: string;
  /** @deprecated No-op — subtitle rendering removed. */
  subtitle?: string;
  /** @deprecated No-op — kicker rendering removed. */
  eyebrow?: string;
  /** @deprecated No-op — subtitle rendering removed. */
  description?: string;
  /** @deprecated Use `actions`. */
  meta?: ReactNode;
  /** @deprecated No-op — accent stamp removed. */
  accent?: string;
  /** @deprecated No-op — accent stamp removed. */
  stamp?: string;
}

export function PageHeader(props: PageHeaderProps): JSX.Element {
  const actions = props.actions ?? props.meta;
  const { title } = props;

  return (
    <header className="mb-7 flex items-start gap-5">
      <div className="flex min-w-0 flex-1 items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-(--fg-primary)">
            {title}
          </h1>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
