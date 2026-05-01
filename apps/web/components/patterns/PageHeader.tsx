import type { JSX, ReactNode } from "react";

/**
 * Primary API — mirrors the prototype `PH` component in project/app.jsx:
 * large mono left stamp (e.g. "W16") · kicker with mint accent dot · title · subtitle · right actions.
 */
export interface PageHeaderProps {
  /** Uppercase small label above title with a leading mint dot. */
  kicker?: string;
  /** Main title (30px bold). */
  title: string;
  /** Descriptive subtitle (14px muted, max-w 560). */
  subtitle?: string;
  /** Right-side action slot (buttons, links). */
  actions?: ReactNode;

  // ---- Back-compat aliases for existing call sites -----------------------
  /** @deprecated Use `kicker`. */
  eyebrow?: string;
  /** @deprecated Use `subtitle`. */
  description?: string;
  /** @deprecated Use `actions`. */
  meta?: ReactNode;
  /** @deprecated No-op — accent stamp removed. */
  accent?: string;
  /** @deprecated No-op — accent stamp removed. */
  stamp?: string;
}

/**
 * PageHeader — ISU signature page treatment.
 *
 * Layout (per app.jsx `PH`):
 *   [stamp 72px mono light]  [kicker · · · · · · ·]            [actions]
 *                            [title  30px bold]
 *                            [subtitle 14px muted max-w 560]
 *
 * Back-compat: older pages pass `accent` / `eyebrow` / `description` / `meta`.
 * We alias those to the new props so the whole repo does not need to change
 * at once — but new code should use the primary names.
 */
export function PageHeader(props: PageHeaderProps): JSX.Element {
  const kicker = props.kicker ?? props.eyebrow;
  const subtitle = props.subtitle ?? props.description;
  const actions = props.actions ?? props.meta;
  const { title } = props;

  return (
    <header className="mb-7 flex items-start gap-5">
      <div className="flex min-w-0 flex-1 items-start justify-between gap-5">
        <div className="min-w-0">
          {kicker ? (
            <p className="text-display text-[11px] font-semibold uppercase tracking-[0.08em] text-(--fg-secondary)">
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-(--brand-primary) align-middle"
              />
              {kicker}
            </p>
          ) : null}
          <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.02em] text-(--fg-primary)">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-(--fg-secondary)">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
