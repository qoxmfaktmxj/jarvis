import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendItem } from "@/lib/queries/dashboard";

export function SearchTrendsWidget({ trends }: { trends: TrendItem[] }) {
  const maxCount = trends[0]?.count ?? 1;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Search Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {trends.length === 0 ? (
          <p className="text-sm text-gray-500">No search trend data this week.</p>
        ) : (
          <ol className="space-y-3">
            {trends.map((trend, index) => (
              <li key={trend.query} className="flex items-center gap-3">
                <span className="w-5 text-xs font-semibold text-gray-400">
                  {index + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-gray-900">
                      {trend.query}
                    </span>
                    <span className="text-xs text-gray-500">{trend.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{
                        width: `${Math.round((trend.count / maxCount) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
