import type { JSX, ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  accent?: string;
};

/**
 * PageHeader — ISU signature page treatment.
 *
 * When `accent` is provided, renders an oversized typographic element (e.g.
 * "W16", "17", or a section glyph) on the far left in a muted tint, with the
 * title block stacked to its right. The muted giant vs. active heading creates
 * the signature visual tension.
 *
 * Without `accent`, falls back to a clean eyebrow / title / description stack.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  accent
}: PageHeaderProps): JSX.Element {
  return (
    <header className="mb-10 flex items-start gap-6 border-b border-surface-200 pb-6">
      {accent ? (
        <span
          aria-hidden="true"
          className="text-display select-none text-7xl font-black leading-[0.85] tracking-tight text-surface-200 md:text-8xl"
        >
          {accent}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-1 items-start justify-between gap-6">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-isu-600">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-lime-500 align-middle" />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-display text-3xl font-bold leading-tight tracking-tight text-surface-900 md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-surface-600">
              {description}
            </p>
          ) : null}
        </div>

        {meta ? (
          <div className="flex shrink-0 items-center gap-2 pt-1">{meta}</div>
        ) : null}
      </div>
    </header>
  );
}
