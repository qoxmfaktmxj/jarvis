"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { FolderPlus, Save, AlertCircle, X } from "lucide-react";
import { createProjectSchema } from "@jarvis/shared/validation/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FormValues = z.infer<typeof createProjectSchema>;

type Props = {
  mode: "create" | "edit";
  projectId?: string;
  defaultValues?: Partial<FormValues>;
};

function normalizeDefaultValues(values?: Partial<FormValues>): FormValues {
  return {
    code: values?.code ?? "",
    name: values?.name ?? "",
    description: values?.description ?? "",
    status: values?.status ?? "active",
    startDate: values?.startDate ?? "",
    endDate: values?.endDate ?? "",
  };
}

export function ProjectForm({ mode, projectId, defaultValues }: Props) {
  const t = useTranslations("Projects.create");
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: normalizeDefaultValues(defaultValues),
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    const response = await fetch(
      mode === "create" ? "/api/projects" : `/api/projects/${projectId}`,
      {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error?.formErrors?.[0] ??
        payload?.error?.fieldErrors?.name?.[0] ??
        payload?.error ??
        t("saveError");
      setServerError(message);
      return;
    }

    const nextProjectId = mode === "create" ? payload?.data?.id : projectId;
    router.push(`/projects/${nextProjectId}`);
    router.refresh();
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = form;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
    >
      <div className="flex items-center gap-2 border-b border-surface-200 bg-surface-50/60 px-5 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
          <FolderPlus className="h-3.5 w-3.5" />
        </span>
        <div>
          <h2 className="text-[13px] font-semibold text-surface-900">
            {mode === "create" ? "새 프로젝트" : "프로젝트 편집"}
          </h2>
          <p className="text-[11px] text-surface-500">
            범위, 일정, 상태를 기록합니다.
          </p>
        </div>
      </div>

      {serverError ? (
        <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{serverError}</span>
        </div>
      ) : null}

      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Field label={t("fields.code")} error={errors.code?.message}>
          <Input placeholder={t("codePlaceholder")} {...register("code")} />
        </Field>

        <Field label={t("fields.status")} error={errors.status?.message}>
          <div className="relative">
            <select
              className="flex h-9 w-full appearance-none rounded-md border border-surface-200 bg-white px-3 pr-8 text-[13px] text-surface-900 shadow-[0_1px_2px_rgba(15,23,42,0.02)] focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-200"
              {...register("status")}
            >
              <option value="active">{t("statuses.active")}</option>
              <option value="on-hold">{t("statuses.onHold")}</option>
              <option value="completed">{t("statuses.completed")}</option>
              <option value="archived">{t("statuses.archived")}</option>
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-surface-400"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path
                d="M3 5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Field>

        <Field label={t("fields.name")} span={2} error={errors.name?.message}>
          <Input placeholder={t("namePlaceholder")} {...register("name")} />
        </Field>

        <Field
          label={t("fields.description")}
          span={2}
          error={errors.description?.message}
        >
          <Textarea
            placeholder="범위, 이해관계자, 딜리버리 목표를 한두 문장으로 요약하세요."
            {...register("description")}
          />
        </Field>

        <Field label="Start date" error={errors.startDate?.message}>
          <Input type="date" {...register("startDate")} />
        </Field>

        <Field label="End date" error={errors.endDate?.message}>
          <Input type="date" {...register("endDate")} />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-surface-100 bg-surface-50/40 px-5 py-3">
        <p className="text-display text-[11px] text-surface-400">
          {mode === "edit" && !isDirty
            ? "변경 사항 없음"
            : "필수 항목: 코드, 이름"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <X className="h-3.5 w-3.5" />
            취소
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            <Save className="h-3.5 w-3.5" />
            {isSubmitting
              ? mode === "create"
                ? "생성 중…"
                : "저장 중…"
              : mode === "create"
                ? "프로젝트 생성"
                : "변경 사항 저장"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function Field({
  label,
  span,
  error,
  children,
}: {
  label: string;
  span?: 2;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1.5", span === 2 && "md:col-span-2")}>
      <span className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-display block text-[11px] font-medium text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
