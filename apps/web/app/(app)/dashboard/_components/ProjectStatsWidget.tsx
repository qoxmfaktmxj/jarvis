import { FolderKanban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectStats } from "@/lib/queries/dashboard";

export function ProjectStatsWidget({ stats }: { stats: ProjectStats }) {
  const entries = Object.entries(stats.byStatus);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Project Stats</CardTitle>
        <FolderKanban className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-semibold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total tracked projects</p>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">No project data yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map(([status, count]) => {
              const width = stats.total > 0 ? Math.max((count / stats.total) * 100, 8) : 0;
              return (
                <li key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize text-gray-600">
                      {status.replaceAll("_", " ")}
                    </span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
