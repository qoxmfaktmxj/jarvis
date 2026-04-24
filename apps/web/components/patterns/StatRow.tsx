export type StatRowItem = {
  label: string;
  value: string | number;
  emphasis?: "normal" | "success" | "warning" | "danger";
};

export type StatRowProps = {
  items: StatRowItem[];
  align?: "left" | "right";
};

const emphasisStyles: Record<NonNullable<StatRowItem["emphasis"]>, string> = {
  normal: "text-[--fg-primary]",
  success: "text-[--brand-primary-text]",
  warning: "text-warning",
  danger: "text-danger",
};

const colCountClass: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};

export function StatRow({ items, align = "left" }: StatRowProps) {
  const colClass = colCountClass[items.length] ?? "sm:grid-cols-4";
  return (
    <dl
      className={`grid grid-cols-2 gap-x-6 gap-y-2 text-sm ${colClass} ${
        align === "right" ? "sm:text-right" : ""
      }`}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-[--fg-secondary]">{item.label}</dt>
          <dd className={`text-display text-lg font-semibold ${emphasisStyles[item.emphasis ?? "normal"]}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
