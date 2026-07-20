import type { ReactNode } from "react";

export function PageHeader(props: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg-primary)]">{props.title}</h1>
        {props.description ? <p className="mt-1 text-sm text-[var(--fg-secondary)]">{props.description}</p> : null}
      </div>
      {props.actions ? <div>{props.actions}</div> : null}
    </header>
  );
}
