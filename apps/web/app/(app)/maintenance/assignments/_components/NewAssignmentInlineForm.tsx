"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { searchEmployees } from "@/lib/server/employees";
import { searchCompanies } from "@/lib/server/companies-search";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import { CompanyPicker } from "@/components/grid/CompanyPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveMaintenanceAction } from "../actions";

type Option = { value: string; label: string };

type Props = {
  contractTypeOptions: Option[];
  onCreated: () => void;
};

type FormState = {
  userId: string;
  userLabel: string;
  companyId: string;
  companyLabel: string;
  startDate: string | null;
  endDate: string | null;
  contractNumber: string;
  contractType: string;
  note: string;
};

const blankForm = (): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    userId: "",
    userLabel: "",
    companyId: "",
    companyLabel: "",
    startDate: today,
    endDate: today,
    contractNumber: "",
    contractType: "",
    note: "",
  };
};

export function NewAssignmentInlineForm({ contractTypeOptions, onCreated }: Props) {
  const t = useTranslations("Maintenance.Assignments");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const reset = () => {
    setForm(blankForm());
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!form.userId) {
      setError(t("dialog.selectUser"));
      return;
    }
    if (!form.companyId) {
      setError(t("dialog.selectCompany"));
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError(t("errors.dateRange"));
      return;
    }
    if (form.startDate > form.endDate) {
      setError(t("errors.dateRange"));
      return;
    }

    startSaving(async () => {
      const result = await saveMaintenanceAction({
        creates: [
          {
            userId: form.userId,
            companyId: form.companyId,
            startDate: form.startDate,
            endDate: form.endDate,
            contractNumber: form.contractNumber.trim() || null,
            contractType: form.contractType || null,
            note: form.note.trim() || null,
          },
        ],
      });
      if (!result.ok) {
        const msg = result.error ?? "save failed";
        setError(
          msg.toLowerCase().includes("duplicate") ? t("errors.duplicate") : msg,
        );
        return;
      }
      reset();
      setOpen(false);
      onCreated();
    });
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t("actions.newAssignment")}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label={t("dialog.newTitle")}
      className="rounded-lg border border-(--border-default) bg-(--bg-page) p-4 shadow-(--shadow-flat)"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-(--fg-primary)">
          {t("dialog.newTitle")}
        </h3>
        <button
          type="button"
          className="text-[12px] text-(--fg-secondary) hover:text-(--fg-primary)"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          ✕
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.user")}
          </span>
          <EmployeePicker
            value={form.userLabel}
            onSelect={(hit) =>
              setForm((f) => ({
                ...f,
                userId: hit.userId,
                userLabel: `${hit.name} (${hit.sabun})`,
              }))
            }
            search={(q, lim) => searchEmployees({ q, limit: lim })}
            placeholder={t("dialog.selectUser")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.company")}
          </span>
          <CompanyPicker
            value={form.companyLabel}
            onSelect={(hit) =>
              setForm((f) => ({
                ...f,
                companyId: hit.id,
                companyLabel: `${hit.name} (${hit.code})`,
              }))
            }
            search={(q, lim) => searchCompanies({ q, limit: lim })}
            placeholder={t("dialog.selectCompany")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.startDate")}
          </span>
          <DatePicker
            value={form.startDate}
            onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
            ariaLabel={t("columns.startDate")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.endDate")}
          </span>
          <DatePicker
            value={form.endDate}
            onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
            ariaLabel={t("columns.endDate")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.contractNumber")}
          </span>
          <Input
            type="text"
            value={form.contractNumber}
            onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
            className="h-8"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.contractType")}
          </span>
          <select
            value={form.contractType}
            onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary)"
          >
            <option value="">{t("filters.all")}</option>
            {contractTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.note")}
          </span>
          <textarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            rows={2}
            className="rounded-md border border-(--border-default) bg-(--bg-page) px-2 py-1 text-[13px] text-(--fg-primary)"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 text-[12px] text-rose-700">{error}</p>
      ) : null}

      <footer className="mt-4 flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isSaving}
        >
          {t("dialog.cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={isSaving}>
          {t("dialog.save")}
        </Button>
      </footer>
    </section>
  );
}
