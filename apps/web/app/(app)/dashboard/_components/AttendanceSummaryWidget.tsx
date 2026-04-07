import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceSummary } from "@/lib/queries/dashboard";

export function AttendanceSummaryWidget({
  summary
}: {
  summary: AttendanceSummary;
}) {
  const attendanceRate =
    summary.totalDays > 0
      ? Math.round(
          ((summary.presentDays + summary.lateDays) / summary.totalDays) * 100
        )
      : 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Attendance This Month</CardTitle>
        <Badge variant={attendanceRate >= 90 ? "success" : "warning"}>
          {attendanceRate}%
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${attendanceRate}%` }}
          />
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-gray-500">Present</span>
            <span className="font-medium text-gray-900">{summary.presentDays}d</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-gray-500">Late</span>
            <span className="font-medium text-amber-700">{summary.lateDays}d</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-gray-500">Absent</span>
            <span className="font-medium text-rose-700">{summary.absentDays}d</span>
          </li>
          <li className="flex items-center justify-between border-t border-gray-100 pt-2">
            <span className="text-gray-500">Total Days</span>
            <span className="font-medium text-gray-900">{summary.totalDays}d</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
