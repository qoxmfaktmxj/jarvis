// apps/web/app/(app)/architecture/components/BuildLifecycleSection.tsx

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { and, desc, eq, count, sql } from "drizzle-orm";
import { Loader2, Clock, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { db } from "@jarvis/db/client";
import { graphSnapshot } from "@jarvis/db/schema/graph";
import { canAccessGraphSnapshotSensitivity } from "@jarvis/auth/rbac";

interface Props {
  workspaceId: string;
  permissions: string[];
}

type BuildStatus = 'pending' | 'running' | 'done' | 'error';

export async function BuildLifecycleSection({ workspaceId, permissions }: Props) {
  const t = await getTranslations("Architecture.BuildLifecycle");

  // Fetch raw rows — sensitivity filtering applied below (same as ArchitecturePage)
  const allRows = await db
    .select({
      id: graphSnapshot.id,
      title: graphSnapshot.title,
      status: graphSnapshot.buildStatus,
      sensitivity: graphSnapshot.sensitivity,
      createdAt: graphSnapshot.createdAt,
    })
    .from(graphSnapshot)
    .where(eq(graphSnapshot.workspaceId, workspaceId))
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(100);

  const authorized = allRows.filter((s) =>
    canAccessGraphSnapshotSensitivity(permissions, s.sensitivity),
  );

  const byStatus: Record<BuildStatus, number> = {
    pending: 0, running: 0, done: 0, error: 0,
  };
  for (const row of authorized) {
    byStatus[row.status as BuildStatus] = (byStatus[row.status as BuildStatus] ?? 0) + 1;
  }

  const recentActive = authorized
    .filter((s) => s.status !== 'done')
    .slice(0, 10);

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">{t("title")}</h2>
        <div className="flex gap-3 text-sm">
          <StatusChip kind="running" count={byStatus.running} label={t("status.running")} />
          <StatusChip kind="pending" count={byStatus.pending} label={t("status.pending")} />
          <StatusChip kind="error"   count={byStatus.error}   label={t("status.error")} />
          <StatusChip kind="done"    count={byStatus.done}    label={t("status.done")} />
        </div>
      </header>

      {recentActive.length > 0 && (
        <ul className="text-sm divide-y">
          {recentActive.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-2">
              <Link
                href={`/architecture?snapshot=${s.id}`}
                className="flex items-center gap-2 min-w-0 hover:underline"
              >
                <StatusIcon kind={s.status as BuildStatus} className="h-3 w-3 shrink-0" />
                <span className="truncate">{s.title}</span>
              </Link>
              <span className="text-xs text-muted-foreground shrink-0">
                {s.createdAt.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusChip({
  kind,
  count,
  label,
}: { kind: BuildStatus; count: number; label: string }) {
  const color = {
    running: "text-blue-600",
    pending: "text-gray-500",
    error:   "text-red-600",
    done:    "text-green-600",
  }[kind];
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <StatusIcon kind={kind} className="h-3 w-3" />
      <span className="text-xs">{label}</span>
      <span className="text-xs font-semibold">{count}</span>
    </span>
  );
}

function StatusIcon({ kind, className }: { kind: BuildStatus; className?: string }) {
  if (kind === "running") return <Loader2 className={`${className} animate-spin text-blue-600`} />;
  if (kind === "pending") return <Circle className={`${className} text-gray-500`} />;
  if (kind === "error")   return <AlertTriangle className={`${className} text-red-600`} />;
  return <CheckCircle2 className={`${className} text-green-600`} />;
}
