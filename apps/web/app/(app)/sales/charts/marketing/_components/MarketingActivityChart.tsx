"use client";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Item = { activityTypeName: string; count: number };

export function MarketingActivityChart({ data }: { data: Item[] }) {
  const t = useTranslations("Sales.Charts.Marketing");
  return (
    <div className="rounded-md border border-(--border-default) bg-(--bg-surface) p-4" data-testid="marketing-activity-chart">
      <h3 className="text-sm font-semibold text-(--fg-secondary)">{t("activityByType")}</h3>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="activityTypeName" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
