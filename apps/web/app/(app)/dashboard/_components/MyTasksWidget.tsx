import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskSummary } from "@/lib/queries/dashboard";

function getTaskVariant(status: string) {
  if (status === "in_progress") {
    return "warning";
  }
  if (status === "blocked") {
    return "destructive";
  }
  return "secondary";
}

export function MyTasksWidget({ tasks }: { tasks: TaskSummary[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>My Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No open tasks assigned to you.</p>
        ) : (
          <ul className="space-y-3">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Link
                      href={`/projects/${task.projectId}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600"
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {task.dueDate ? `Due ${task.dueDate}` : "No due date"}
                    </p>
                  </div>
                  <Badge variant={getTaskVariant(task.status)}>{task.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
