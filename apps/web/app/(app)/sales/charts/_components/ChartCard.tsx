import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  filters?: ReactNode;
  children: ReactNode;
}

export function ChartCard({ title, filters, children }: ChartCardProps) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {filters ? <div className="flex items-center gap-2">{filters}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
