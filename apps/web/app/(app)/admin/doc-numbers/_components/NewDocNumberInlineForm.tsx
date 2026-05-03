"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { searchEmployees } from "@/lib/server/employees";
import { EmployeePicker } from "@/components/grid/EmployeePicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveDocumentNumbersAction } from "../actions";

type Props = {
  onCreated: () => void;
};

type FormState = {
  year: string;
  docName: string;
  userId: string | null;
  userLabel: string;
  docDate: string | null;
  note: string;
};

const blankForm = (): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    year: String(new Date().getFullYear()),
    docName: "",
    userId: null,
    userLabel: "",
    docDate: today,
    note: "",
  };
};

export function NewDocNumberInlineForm({ onCreated }: Props) {
  const t = useTranslations("DocNumbers.Page");
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
    if (!/^\d{4}$/.test(form.year)) {
      setError(t("errors.yearFormat"));
      return;
    }
    if (!form.docName.trim()) {
      setError(t("columns.docName"));
      return;
    }

    startSaving(async () => {
      const result = await saveDocumentNumbersAction({
        creates: [
          {
            year: form.year,
            docName: form.docName.trim(),
            userId: form.userId,
            docDate: form.docDate,
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
          {t("actions.newEntry")}
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
          aria-label={t("dialog.close")}
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
            {t("columns.year")}
          </span>
          <Input
            type="text"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value.slice(0, 4) }))}
            placeholder={t("dialog.yearHint")}
            className="h-8"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.docNo")}
          </span>
          <span className="flex h-8 items-center rounded-md border border-(--border-default) bg-(--bg-surface) px-2 text-[12px] italic text-(--fg-secondary)">
            {t("dialog.autoDocNo")}
          </span>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.docName")}
          </span>
          <Input
            type="text"
            value={form.docName}
            onChange={(e) => setForm((f) => ({ ...f, docName: e.target.value }))}
            className="h-8"
            maxLength={300}
            required
          />
        </label>

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
            {t("columns.docDate")}
          </span>
          <DatePicker
            value={form.docDate}
            onChange={(v) => setForm((f) => ({ ...f, docDate: v }))}
            ariaLabel={t("columns.docDate")}
          />
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
