"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createSystemAccessSchema } from "@jarvis/shared/validation/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.input<typeof createSystemAccessSchema>;

const defaultValues: FormValues = {
  accessType: "db",
  label: "",
  host: "",
  port: undefined,
  usernameRef: "",
  passwordRef: "",
  connectionStringRef: "",
  vpnFileRef: "",
  notes: "",
  requiredRole: "DEVELOPER"
};

export function AccessEntryForm({ systemId }: { systemId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(createSystemAccessSchema),
    defaultValues
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const response = await fetch(`/api/systems/${systemId}/access`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(values)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const fieldErrors = payload?.error?.fieldErrors ?? {};
      const message =
        payload?.error?.formErrors?.[0] ??
        fieldErrors.label?.[0] ??
        payload?.error ??
        "Failed to add the access entry.";
      setServerError(message);
      return;
    }

    form.reset(defaultValues);
    router.refresh();
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = form;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Add Access Entry</h3>
          <p className="text-sm text-gray-500">
            Store credentials as `vault://...` refs when possible.
          </p>
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Add Entry"}
        </Button>
      </div>

      {serverError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Type</span>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...register("accessType")}
          >
            <option value="db">db</option>
            <option value="ssh">ssh</option>
            <option value="vpn">vpn</option>
            <option value="web">web</option>
            <option value="api">api</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Label</span>
          <Input placeholder="Primary DB" {...register("label")} />
          {errors.label ? (
            <span className="text-sm text-rose-600">{errors.label.message}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium text-gray-700">Host</span>
          <Input placeholder="db.internal.example.com" {...register("host")} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Port</span>
          <Input
            type="number"
            placeholder="5432"
            {...register("port", {
              setValueAs: (value) =>
                value === "" || value === undefined ? undefined : Number(value)
            })}
          />
          {errors.port ? (
            <span className="text-sm text-rose-600">{errors.port.message}</span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Username Ref</span>
          <Input
            placeholder="vault://jarvis/payroll/username"
            {...register("usernameRef")}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Password Ref</span>
          <Input
            placeholder="vault://jarvis/payroll/password"
            {...register("passwordRef")}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">
            Connection String Ref
          </span>
          <Input
            placeholder="vault://jarvis/payroll/connection-string"
            {...register("connectionStringRef")}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">VPN File Ref</span>
          <Input
            placeholder="vault://jarvis/payroll/vpn-config"
            {...register("vpnFileRef")}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Required Role</span>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...register("requiredRole")}
          >
            <option value="VIEWER">VIEWER</option>
            <option value="DEVELOPER">DEVELOPER</option>
            <option value="MANAGER">MANAGER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <Textarea
            placeholder="Connection notes, SSH jump host, or troubleshooting tips."
            {...register("notes")}
          />
        </label>
      </div>
    </form>
  );
}
