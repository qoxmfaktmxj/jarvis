"use client";

import { useState, type KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { shouldSubmitQuestion } from "./ask-keyboard";
import { AnswerCard } from "./AnswerCard";
import type { SourceRef } from "./SourceRefCard";

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "source"; source: SourceRef }
  | { type: "abstain"; reason: string }
  | { type: "done" }
  | { type: "error"; errorCode: string }
  | { type: "tool"; name: string };

export function AskPanel({ conversationId }: { conversationId?: string }) {
  const t = useTranslations("Ask.Composer");
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!question.trim() || pending) {
      return;
    }
    setPending(true);
    setAnswer("");
    setSources([]);
    setError(null);

    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, question }),
    }).catch(() => null);

    if (!response?.ok || !response.body) {
      setPending(false);
      setError(t("failed"));
      return;
    }

    const nextConversationId = response.headers.get("x-conversation-id");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const eventName = frame.match(/^event: (.+)$/m)?.[1];
        const dataLine = frame.match(/^data: (.+)$/m)?.[1];
        if (!eventName || !dataLine) {
          continue;
        }
        const payload = JSON.parse(dataLine) as StreamEvent;
        if (payload.type === "text") {
          setAnswer((current) => current + payload.text);
        } else if (payload.type === "source") {
          setSources((current) => [...current, payload.source]);
        } else if (payload.type === "abstain") {
          setAnswer(payload.reason);
        } else if (payload.type === "error") {
          setError(payload.errorCode);
        }
      }
    }

    setPending(false);
    if (!conversationId && nextConversationId) {
      router.replace(`/ask/${nextConversationId}`);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (!shouldSubmitQuestion({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
    })) {
      return;
    }
    event.preventDefault();
    void submit();
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] shadow-[var(--shadow-soft)] transition-colors focus-within:border-[var(--brand-primary)] focus-within:ring-1 focus-within:ring-[var(--brand-primary)]">
        <label htmlFor="ask-question" className="sr-only">
          {t("label")}
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={t("placeholder")}
          disabled={pending}
          className="block min-h-24 max-h-60 w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-3 py-2">
          <span className="hidden text-xs text-[var(--fg-muted)] sm:inline">{t("hint")}</span>
          <Button
            size="icon"
            className="ml-auto rounded-lg"
            disabled={pending || !question.trim()}
            onClick={() => void submit()}
            aria-label={pending ? t("submitting") : t("submit")}
            title={pending ? t("submitting") : t("submit")}
          >
            {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {answer ? <AnswerCard text={answer} sources={sources} /> : null}
    </section>
  );
}
