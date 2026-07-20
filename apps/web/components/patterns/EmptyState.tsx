import type { ReactNode } from "react";

export function EmptyState(props: { title: string; description: string; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-dashed border-[var(--border-default)] p-8 text-center">
      <h2 className="font-medium text-[var(--fg-primary)]">{props.title}</h2>
      <p className="mt-2 text-sm text-[var(--fg-secondary)]">{props.description}</p>
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </section>
  );
}
