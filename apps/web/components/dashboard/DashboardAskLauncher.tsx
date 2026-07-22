"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DASHBOARD_ASK_DRAFT_KEY } from "@/components/ai/ask-draft";
import { shouldSubmitQuestion } from "@/components/ai/ask-keyboard";
import { Button } from "@/components/ui/button";

const SUGGESTION_KEYS = ["meal", "retirement", "dailyWorker", "localTax"] as const;

export function DashboardAskLauncher() {
  const t = useTranslations("Dashboard.Home");
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(): void {
    const draft = question.trim();
    if (!draft) return;
    try {
      sessionStorage.setItem(DASHBOARD_ASK_DRAFT_KEY, draft);
      setError(null);
      router.push("/ask");
    } catch {
      setError(t("launcherStorageFailed"));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (!shouldSubmitQuestion({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    })) return;
    event.preventDefault();
    submit();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-page)] shadow-[var(--shadow-soft)]">
      <div className="p-5 sm:p-7">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-[var(--fg-primary)] sm:text-3xl">
          {t("launcherTitle")}
        </h2>
        <p className="mt-2 text-sm text-[var(--fg-secondary)]">{t("launcherDescription")}</p>

        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] transition-colors focus-within:border-[var(--brand-primary)] focus-within:ring-1 focus-within:ring-[var(--brand-primary)]">
          <label htmlFor="dashboard-question" className="sr-only">{t("launcherLabel")}</label>
          <textarea
            id="dashboard-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            maxLength={2_000}
            placeholder={t("launcherPlaceholder")}
            className="block min-h-24 max-h-48 w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)]"
          />
          <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-3 py-2">
            <span className="hidden text-xs text-[var(--fg-muted)] sm:inline">{t("launcherHint")}</span>
            <Button
              size="sm"
              className="ml-auto gap-2 rounded-lg"
              disabled={!question.trim()}
              onClick={submit}
            >
              {t("launcherSubmit")}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTION_KEYS.map((key) => {
            const suggestion = t(`suggestions.${key}`);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setQuestion(suggestion);
                  setError(null);
                }}
                className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--fg-secondary)] transition-colors hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                {suggestion}
              </button>
            );
          })}
        </div>
        {error ? <p role="alert" className="mt-3 border-l-2 border-[var(--brand-primary)] pl-3 text-sm text-[var(--fg-secondary)]">{error}</p> : null}
      </div>
    </section>
  );
}
