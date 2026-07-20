"use client";

export function SearchFilters(props: {
  q: string;
  asOf: string;
  types: string[];
}) {
  return (
    <form action="/search" className="grid gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)] md:grid-cols-4">
      <input
        name="q"
        defaultValue={props.q}
        placeholder="검색어"
        className="h-10 rounded-md border border-[var(--border-default)] px-3"
      />
      <input
        name="asOf"
        defaultValue={props.asOf}
        placeholder="YYYY-MM-DD"
        className="h-10 rounded-md border border-[var(--border-default)] px-3"
      />
      <input
        name="types"
        defaultValue={props.types.join(",")}
        placeholder="wiki,source,legal_case"
        className="h-10 rounded-md border border-[var(--border-default)] px-3"
      />
      <button type="submit" className="h-10 rounded-md bg-[var(--brand-primary)] px-4 text-white">
        검색
      </button>
    </form>
  );
}
