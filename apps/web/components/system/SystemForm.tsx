"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createSystemSchema } from "@jarvis/shared/validation/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.infer<typeof createSystemSchema>;

type Props = {
  mode: "create" | "edit";
  systemId?: string;
  defaultValues?: Partial<FormValues>;
};

function normalizeDefaultValues(values?: Partial<FormValues>): FormValues {
  return {
    name: values?.name ?? "",
    category: values?.category ?? "",
    environment: values?.environment ?? "prod",
    description: values?.description ?? "",
    techStack: values?.techStack ?? "",
    repositoryUrl: values?.repositoryUrl ?? "",
    dashboardUrl: values?.dashboardUrl ?? "",
    sensitivity: values?.sensitivity ?? "INTERNAL",
    status: values?.status ?? "active"
  };
}

export function SystemForm({ mode, systemId, defaultValues }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(createSystemSchema),
    defaultValues: normalizeDefaultValues(defaultValues)
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);

    const response = await fetch(
      mode === "create" ? "/api/systems" : `/api/systems/${systemId}`,
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
      const fieldErrors = payload?.error?.fieldErrors ?? {};
      const message =
        payload?.error?.formErrors?.[0] ??
        fieldErrors.name?.[0] ??
        fieldErrors.repositoryUrl?.[0] ??
        payload?.error ??
        "An error occurred while saving the system.";
      setServerError(message);
      return;
    }

    const nextSystemId = mode === "create" ? payload?.data?.id : systemId;
    router.push(`/systems/${nextSystemId}`);
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
          <span className="text-sm font-medium text-gray-700">System Name</span>
          <Input placeholder="Payroll API" {...register("name")} />
          {errors.name ? (
            <span className="text-sm text-rose-600">{errors.name.message}</span>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Category</span>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...register("category")}
          >
            <option value="">Select category</option>
            <option value="web">web</option>
            <option value="db">db</option>
            <option value="server">server</option>
            <option value="network">network</option>
            <option value="middleware">middleware</option>
          </select>
          {errors.category ? (
            <span className="text-sm text-rose-600">{errors.category.message}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Environment</span>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...register("environment")}
          >
            <option value="prod">prod</option>
            <option value="staging">staging</option>
            <option value="dev">dev</option>
          </select>
          {errors.environment ? (
            <span className="text-sm text-rose-600">{errors.environment.message}</span>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Sensitivity</span>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...register("sensitivity")}
          >
            <option value="INTERNAL">INTERNAL</option>
            <option value="PUBLIC">PUBLIC</option>
            <option value="RESTRICTED">RESTRICTED</option>
            <option value="SECRET_REF_ONLY">SECRET_REF_ONLY</option>
          </select>
          {errors.sensitivity ? (
            <span className="text-sm text-rose-600">{errors.sensitivity.message}</span>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Status</span>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...register("status")}
          >
            <option value="active">active</option>
            <option value="deprecated">deprecated</option>
            <option value="decommissioned">decommissioned</option>
          </select>
          {errors.status ? (
            <span className="text-sm text-rose-600">{errors.status.message}</span>
          ) : null}
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-medium text-gray-700">Description</span>
        <Textarea
          placeholder="Document the system purpose, business owner, and operational notes."
          {...register("description")}
        />
        {errors.description ? (
          <span className="text-sm text-rose-600">{errors.description.message}</span>
        ) : null}
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-gray-700">Tech Stack</span>
        <Input
          placeholder="Next.js, PostgreSQL, Redis"
          {...register("techStack")}
        />
        {errors.techStack ? (
          <span className="text-sm text-rose-600">{errors.techStack.message}</span>
        ) : null}
      </label>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Repository URL</span>
          <Input
            placeholder="https://github.com/acme/payroll"
            {...register("repositoryUrl")}
          />
          {errors.repositoryUrl ? (
            <span className="text-sm text-rose-600">
              {errors.repositoryUrl.message}
            </span>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Dashboard URL</span>
          <Input
            placeholder="https://grafana.example.com/payroll"
            {...register("dashboardUrl")}
          />
          {errors.dashboardUrl ? (
            <span className="text-sm text-rose-600">
              {errors.dashboardUrl.message}
            </span>
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
              ? "Register System"
              : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
