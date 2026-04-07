import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SystemCardProps = {
  system: {
    id: string;
    name: string;
    category: string | null;
    environment: string | null;
    status: string;
    sensitivity: string;
    description: string | null;
    repositoryUrl: string | null;
    dashboardUrl: string | null;
  };
};

function statusVariant(status: string) {
  if (status === "active") {
    return "success";
  }
  if (status === "deprecated") {
    return "warning";
  }
  return "destructive";
}

export function SystemCard({ system }: SystemCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="items-start">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{system.name}</CardTitle>
            <Badge variant={statusVariant(system.status)}>{system.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {system.environment ? (
              <Badge variant="secondary">{system.environment}</Badge>
            ) : null}
            {system.category ? <Badge variant="outline">{system.category}</Badge> : null}
            <Badge variant="outline">{system.sensitivity}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="min-h-12 text-sm text-gray-600">
          {system.description || "No description provided."}
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          {system.repositoryUrl ? (
            <a
              href={system.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              Repository
            </a>
          ) : null}
          {system.dashboardUrl ? (
            <a
              href={system.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              Dashboard
            </a>
          ) : null}
        </div>
        <Link
          href={`/systems/${system.id}`}
          className="inline-flex rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          View Details
        </Link>
      </CardContent>
    </Card>
  );
}
