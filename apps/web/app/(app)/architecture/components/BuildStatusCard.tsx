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
      <div className="rounded-lg border border-isu-200 bg-isu-50/50 p-6 dark:border-isu-900 dark:bg-isu-950/20">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-isu-600" />
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
      <div className="rounded-lg border border-border bg-muted/40 p-6">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <p className="font-medium">{t("pending", { title })}</p>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="font-medium">{t("error", { title })}</p>
      </div>
      {error && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-3 text-xs">
          {error}
        </pre>
      )}
    </div>
  );
}
