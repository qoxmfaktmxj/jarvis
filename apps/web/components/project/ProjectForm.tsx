"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { createProjectSchema } from "@jarvis/shared/validation/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    endDate: values?.endDate ?? ""
  };
}

export function ProjectForm({ mode, projectId, defaultValues }: Props) {
  const t = useTranslations("Projects.create");
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: normalizeDefaultValues(defaultValues)
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    const response = await fetch(
      mode === "create" ? "/api/projects" : `/api/projects/${projectId}`,
      {
        method: mode === "create" ? "POST" : "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(values)
      }
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
    formState: { errors, isSubmitting }
  } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("fields.code")}</span>
          <Input placeholder={t("codePlaceholder")} {...register("code")} />
          {errors.code ? (
            <span className="text-sm text-rose-600">{errors.code.message}</span>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("fields.status")}</span>
          <select
            className="flex h-10 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-100"
            {...register("status")}
          >
            <option value="active">{t("statuses.active")}</option>
            <option value="on-hold">{t("statuses.onHold")}</option>
            <option value="completed">{t("statuses.completed")}</option>
            <option value="archived">{t("statuses.archived")}</option>
          </select>
          {errors.status ? (
            <span className="text-sm text-rose-600">{errors.status.message}</span>
          ) : null}
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-medium text-surface-700">{t("fields.name")}</span>
        <Input placeholder={t("namePlaceholder")} {...register("name")} />
        {errors.name ? (
          <span className="text-sm text-rose-600">{errors.name.message}</span>
        ) : null}
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-surface-700">{t("fields.description")}</span>
        <Textarea
          placeholder="Summarize the scope, stakeholders, and delivery goals."
          {...register("description")}
        />
        {errors.description ? (
          <span className="text-sm text-rose-600">
            {errors.description.message}
          </span>
        ) : null}
      </label>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-surface-700">Start Date</span>
          <Input type="date" {...register("startDate")} />
          {errors.startDate ? (
            <span className="text-sm text-rose-600">{errors.startDate.message}</span>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-surface-700">End Date</span>
          <Input type="date" {...register("endDate")} />
          {errors.endDate ? (
            <span className="text-sm text-rose-600">{errors.endDate.message}</span>
          ) : null}
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Project"
              : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
