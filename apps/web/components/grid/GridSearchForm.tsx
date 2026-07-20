"use client";

export function GridSearchForm(props: { defaultValue?: string; name?: string; placeholder?: string }) {
  return (
    <input
      name={props.name ?? "q"}
      defaultValue={props.defaultValue ?? ""}
      placeholder={props.placeholder ?? "검색어를 입력하세요"}
      className="h-10 rounded-md border border-[var(--border-default)] px-3"
    />
  );
}
