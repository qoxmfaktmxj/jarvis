// apps/web/app/(app)/architecture/components/BuildStatusCard.tsx

import { getTranslations } from "next-intl/server";
import { Loader2, Clock, AlertTriangle } from "lucide-react";

interface Props {
  kind: "running" | "pending" | "error";
  title: string;
  startedAt: Date;
  error?: string | null;
}

export async function BuildStatusCard({ kind, title, startedAt, error }: Props) {
  const t = await getTranslations("Architecture.BuildStatus");
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

  if (kind === "running") {
    return (
      <div className="border rounded-lg p-6 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div>
            <p className="font-medium">{t("running", { title })}</p>
            <p className="text-xs text-muted-foreground">
              {t("elapsed", { seconds: elapsedSec })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "pending") {
    return (
      <div className="border rounded-lg p-6 bg-gray-50 dark:bg-gray-900/20">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-gray-500" />
          <p className="font-medium">{t("pending", { title })}</p>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="border rounded-lg p-6 bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900 space-y-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <p className="font-medium">{t("error", { title })}</p>
      </div>
      {error && (
        <pre className="text-xs bg-red-100/60 dark:bg-red-950/40 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">
          {error}
        </pre>
      )}
    </div>
  );
}
