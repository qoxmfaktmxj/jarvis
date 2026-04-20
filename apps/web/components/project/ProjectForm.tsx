"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProjectFormValues = {
  name: string;
  description: string;
  sensitivity: string;
  status: string;
};

type Props = {
  mode: "create" | "edit";
  projectId?: string;
  defaultValues?: Partial<ProjectFormValues>;
};

function normalizeDefaultValues(values?: Partial<ProjectFormValues>): ProjectFormValues {
  return {
    name: values?.name ?? "",
    description: values?.description ?? "",
    sensitivity: values?.sensitivity ?? "INTERNAL",
    status: values?.status ?? "active"
  };
}

export function ProjectForm({ mode, projectId, defaultValues }: Props) {
  const t = useTranslations("Projects.Form");
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const vals = normalizeDefaultValues(defaultValues);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch(
        mode === "create" ? "/api/projects" : `/api/projects/${projectId}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data)
        }
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldErrors = payload?.error?.fieldErrors ?? {};
        const message =
          payload?.error?.formErrors?.[0] ??
          fieldErrors.name?.[0] ??
          payload?.error ??
          "An error occurred while saving the project.";
        setServerError(message);
        return;
      }

      const nextProjectId = mode === "create" ? payload?.data?.id : projectId;
      router.push(`/projects/${nextProjectId}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {serverError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {serverError}
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-surface-700">{t("name")}</span>
        <Input name="name" defaultValue={vals.name} placeholder="Payroll API" required />
      </label>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("sensitivity")}</span>
          <select
            name="sensitivity"
            defaultValue={vals.sensitivity}
            className="flex h-10 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-100"
          >
            <option value="INTERNAL">INTERNAL</option>
            <option value="PUBLIC">PUBLIC</option>
            <option value="RESTRICTED">RESTRICTED</option>
            <option value="SECRET_REF_ONLY">SECRET_REF_ONLY</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("status")}</span>
          <select
            name="status"
            defaultValue={vals.status}
            className="flex h-10 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-100"
          >
            <option value="active">active</option>
            <option value="deprecated">deprecated</option>
            <option value="decommissioned">decommissioned</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-surface-700">{t("description")}</span>
        <Textarea
          name="description"
          defaultValue={vals.description}
          placeholder={t("descriptionPlaceholder")}
        />
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? t("creating")
              : t("saving")
            : mode === "create"
              ? t("register")
              : t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
