import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  description,
  accent
}: {
  title: string;
  value: string;
  description?: string;
  accent?: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="items-center border-b-0 pb-0">
        <CardTitle>{title}</CardTitle>
        {accent}
      </CardHeader>
      <CardContent className="space-y-1 pt-2">
        <p className="text-3xl font-semibold tracking-tight text-gray-900">
          {value}
        </p>
        {description ? (
          <p className="text-sm text-gray-500">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
