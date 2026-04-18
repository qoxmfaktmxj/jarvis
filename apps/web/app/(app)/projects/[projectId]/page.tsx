import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Calendar,
  ListChecks,
  Users,
  MessageSquare,
  FileText,
  Hash,
} from "lucide-react";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getProjectDetail } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<
  string,
  { label: string; dot: string; chip: string }
> = {
  active: {
    label: "Active",
    dot: "bg-isu-500",
    chip: "bg-isu-50 text-isu-700 ring-isu-500/20",
  },
  "on-hold": {
    label: "On hold",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  archived: {
    label: "Archived",
    dot: "bg-surface-400",
    chip: "bg-surface-100 text-surface-600 ring-surface-300",
  },
};

function formatDate(value: string | null) {
  return value ?? "—";
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations("Projects.detail");
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const project = await getProjectDetail({
    workspaceId: session.workspaceId,
    projectId,
  });

  if (!project) {
    notFound();
  }

  const status = STATUS_STYLES[project.status] ?? STATUS_STYLES.active!;

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-surface-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
            status.chip,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} aria-hidden />
          {status.label}
        </span>

        <MetaItem Icon={Hash} label="Project Code" value={project.code} mono />
        <MetaItem Icon={Calendar} label="Start" value={formatDate(project.startDate)} />
        <MetaItem Icon={Calendar} label="End" value={formatDate(project.endDate)} />
      </div>

      {/* KPI strip */}
      <section>
        <SectionHeader title="Overview" />
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard
            Icon={ListChecks}
            label={t("tasks")}
            value={project.taskCount}
            tone="isu"
          />
          <KpiCard
            Icon={Users}
            label={t("staff")}
            value={project.staffCount}
            tone="emerald"
          />
          <KpiCard
            Icon={MessageSquare}
            label={t("inquiries")}
            value={project.inquiryCount}
            tone="amber"
          />
        </div>
      </section>

      {/* Summary */}
      <section>
        <SectionHeader title={t("summary")} />
        <div className="rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <dl className="grid gap-x-6 gap-y-4 p-5 md:grid-cols-2">
            <SummaryField label="Project Code">
              <span className="text-display font-mono text-[13px] tabular-nums text-surface-900">
                {project.code}
              </span>
            </SummaryField>
            <SummaryField label="Workspace Status">
              <span className="text-[13px] text-surface-800">{project.status}</span>
            </SummaryField>
            <SummaryField label="Description" span={2}>
              <div className="flex items-start gap-2 text-[13.5px] leading-relaxed text-surface-700">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-surface-400" />
                <p className="[text-wrap:pretty]">
                  {project.description || (
                    <span className="italic text-surface-400">
                      아직 프로젝트 설명이 없습니다.
                    </span>
                  )}
                </p>
              </div>
            </SummaryField>
          </dl>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MetaItem({
  Icon,
  label,
  value,
  mono,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-[12px]">
      <Icon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-surface-400" />
      <span className="text-display text-[10px] font-semibold uppercase tracking-wide text-surface-500">
        {label}
      </span>
      <span
        className={cn(
          "font-medium text-surface-800",
          mono && "font-mono text-[12px] tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function KpiCard({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "isu" | "emerald" | "amber";
}) {
  const toneMap = {
    isu: "bg-isu-50 text-isu-600 ring-isu-200",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-200",
    amber: "bg-amber-50 text-amber-600 ring-amber-200",
  } as const;

  return (
    <article className="group relative overflow-hidden rounded-md border border-surface-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:-translate-y-[1px] hover:border-isu-200 hover:shadow-[0_8px_24px_-14px_rgba(28,77,167,0.18)]">
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-inset",
            toneMap[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="text-display mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </p>
      <p className="text-display mt-0.5 text-[30px] font-semibold leading-none tabular-nums text-surface-900">
        {value.toLocaleString()}
      </p>
    </article>
  );
}

function SummaryField({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: 2;
}) {
  return (
    <div className={cn("space-y-1", span === 2 && "md:col-span-2")}>
      <dt className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
