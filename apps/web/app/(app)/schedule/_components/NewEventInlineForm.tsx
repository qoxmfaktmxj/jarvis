"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveSchedulesAction } from "../actions";

type Props = {
  onCreated: () => void;
};

type FormState = {
  startDate: string | null;
  endDate: string | null;
  title: string;
  memo: string;
  isShared: boolean;
};

const blankForm = (): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    startDate: today,
    endDate: today,
    title: "",
    memo: "",
    isShared: false,
  };
};

export function NewEventInlineForm({ onCreated }: Props) {
  const t = useTranslations("Schedule.Page");
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
    if (!form.startDate || !form.endDate) {
      setError(t("errors.dateRange"));
      return;
    }
    if (form.startDate > form.endDate) {
      setError(t("errors.dateRange"));
      return;
    }
    if (!form.title.trim()) {
      setError(t("columns.title"));
      return;
    }

    startSaving(async () => {
      const result = await saveSchedulesAction({
        creates: [
          {
            startDate: form.startDate,
            endDate: form.endDate,
            title: form.title.trim(),
            memo: form.memo.trim() || null,
            orderSeq: 0,
            isShared: form.isShared,
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
          {t("actions.newEvent")}
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

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.title")}
          </span>
          <Input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="h-8"
            maxLength={200}
            required
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.memo")}
          </span>
          <textarea
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
            rows={2}
            className="rounded-md border border-(--border-default) bg-(--bg-page) px-2 py-1 text-[13px] text-(--fg-primary)"
          />
        </label>

        <label className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            checked={form.isShared}
            onChange={(e) => setForm((f) => ({ ...f, isShared: e.target.checked }))}
          />
          <span className="text-[12px] text-(--fg-primary)">
            {t("columns.isShared")} ({t("shared.yes")})
          </span>
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
