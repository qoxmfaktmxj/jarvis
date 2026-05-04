"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveFaqAction } from "../actions";

type Option = { value: string; label: string };

type Props = {
  bizCodeOptions: Option[];
  onCreated: () => void;
};

type FormState = {
  bizCode: string;
  question: string;
  answer: string;
};

const blankForm = (): FormState => ({ bizCode: "", question: "", answer: "" });

export function NewFaqInlineForm({ bizCodeOptions, onCreated }: Props) {
  const t = useTranslations("Faq.Page");
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
    if (!form.question.trim()) {
      setError(t("errors.questionRequired"));
      return;
    }
    if (!form.answer.trim()) {
      setError(t("errors.answerRequired"));
      return;
    }

    startSaving(async () => {
      const result = await saveFaqAction({
        creates: [
          {
            bizCode: form.bizCode || null,
            question: form.question.trim(),
            answer: form.answer.trim(),
            fileSeq: null,
          },
        ],
      });
      if (!result.ok) {
        setError(result.error ?? "save failed");
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

      <div className="grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.bizCode")}
          </span>
          <select
            value={form.bizCode}
            onChange={(e) => setForm((f) => ({ ...f, bizCode: e.target.value }))}
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary)"
          >
            <option value="">{t("filters.all")}</option>
            {bizCodeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.question")}
          </span>
          <Input
            type="text"
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            className="h-8"
            maxLength={500}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {t("columns.answer")}
          </span>
          <textarea
            value={form.answer}
            onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
            rows={4}
            className="rounded-md border border-(--border-default) bg-(--bg-page) px-2 py-1 text-[13px] text-(--fg-primary)"
            required
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
