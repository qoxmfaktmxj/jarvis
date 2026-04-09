"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditLogEntry } from "@/lib/queries/dashboard";

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function RecentActivityWidget({
  entries
}: {
  entries: AuditLogEntry[];
}) {
  const t = useTranslations("Dashboard.RecentActivity");

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{entry.action}</Badge>
                  <span className="text-xs text-gray-400">
                    {formatTime(entry.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-800">
                  {entry.resourceType}
                  {entry.resourceId ? ` • ${entry.resourceId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
