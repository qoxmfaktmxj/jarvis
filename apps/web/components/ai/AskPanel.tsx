"use client";

import React, { useEffect, useRef, useState, type KeyboardEvent } from "react";
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

export type AskHistoryMessage = {
  id: string;
  role: string;
  content: string;
  citations: SourceRef[];
};

function UserTurn({ content }: { content: string }) {
  return (
    <div data-message-role="user" className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-[var(--border-default)] bg-[var(--bg-page)] px-4 py-3 text-sm leading-relaxed text-[var(--fg-primary)] shadow-[var(--shadow-soft)]">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

function AssistantTurn(props: { label: string; text: string; sources: SourceRef[]; pending?: boolean }) {
  return (
    <div data-message-role="assistant">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
          {props.label}
        </span>
        {props.pending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-[var(--brand-primary)]" /> : null}
        <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-default)]" />
      </div>
      {props.text ? <AnswerCard text={props.text} sources={props.sources} /> : null}
    </div>
  );
}

export function AskPanel({
  conversationId,
  initialMessages = [],
}: {
  conversationId?: string;
  initialMessages?: AskHistoryMessage[];
}) {
  const t = useTranslations("Ask");
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const localId = useRef(0);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [localMessages, setLocalMessages] = useState<AskHistoryMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const messages = [...initialMessages, ...localMessages];
  const hasConversation = messages.length > 0 || pending || Boolean(answer) || Boolean(error);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [answer, error, localMessages, pending, sources]);

  function nextLocalId(role: string): string {
    localId.current += 1;
    return `local-${role}-${localId.current}`;
  }

  async function submit(): Promise<void> {
    const submittedQuestion = question.trim();
    if (!submittedQuestion || pending) {
      return;
    }

    setQuestion("");
    setPending(true);
    setAnswer("");
    setSources([]);
    setError(null);
    setLocalMessages((current) => [
      ...current,
      { id: nextLocalId("user"), role: "user", content: submittedQuestion, citations: [] },
    ]);

    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, question: submittedQuestion }),
    }).catch(() => null);

    if (!response?.ok || !response.body) {
      setPending(false);
      setError(t("Composer.failed"));
      return;
    }

    const nextConversationId = response.headers.get("x-conversation-id");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completedAnswer = "";
    let completedSources: SourceRef[] = [];

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
          completedAnswer += payload.text;
          setAnswer(completedAnswer);
        } else if (payload.type === "source") {
          completedSources = [...completedSources, payload.source];
          setSources(completedSources);
        } else if (payload.type === "abstain") {
          completedAnswer = payload.reason;
          setAnswer(payload.reason);
        } else if (payload.type === "error") {
          setError(payload.errorCode);
        }
      }
    }

    setPending(false);
    if (completedAnswer) {
      setLocalMessages((current) => [
        ...current,
        {
          id: nextLocalId("assistant"),
          role: "assistant",
          content: completedAnswer,
          citations: completedSources,
        },
      ]);
      setAnswer("");
      setSources([]);
    }

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
    <section className="flex h-full min-h-0 flex-col">
      <div data-testid="ask-timeline" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 sm:px-6">
          {hasConversation ? (
            <div className="space-y-8 py-6">
              {messages.map((message) =>
                message.role === "assistant" ? (
                  <AssistantTurn
                    key={message.id}
                    label={t("Timeline.assistant")}
                    text={message.content}
                    sources={message.citations}
                  />
                ) : (
                  <UserTurn key={message.id} content={message.content} />
                ),
              )}
              {pending || answer ? (
                <AssistantTurn
                  label={pending && !answer ? t("Timeline.thinking") : t("Timeline.assistant")}
                  text={answer}
                  sources={sources}
                  pending={pending}
                />
              ) : null}
              {error ? (
                <p role="alert" className="border-l-2 border-[var(--brand-primary)] px-3 py-2 text-sm text-[var(--fg-secondary)]">
                  {error}
                </p>
              ) : null}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center gap-3 py-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
                {t("Empty.eyebrow")}
              </p>
              <h2 className="text-3xl font-bold tracking-[-0.02em] text-[var(--fg-primary)]">
                {t("Empty.title")}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-[var(--fg-secondary)]">
                {t("Empty.description")}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] shadow-[var(--shadow-soft)] transition-colors focus-within:border-[var(--brand-primary)] focus-within:ring-1 focus-within:ring-[var(--brand-primary)]">
          <label htmlFor="ask-question" className="sr-only">
            {t("Composer.label")}
          </label>
          <textarea
            id="ask-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder={t("Composer.placeholder")}
            disabled={pending}
            className="block min-h-24 max-h-60 w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-3 py-2">
            <span className="hidden text-xs text-[var(--fg-muted)] sm:inline">{t("Composer.hint")}</span>
            <Button
              size="icon"
              className="ml-auto rounded-lg"
              disabled={pending || !question.trim()}
              onClick={() => void submit()}
              aria-label={pending ? t("Composer.submitting") : t("Composer.submit")}
              title={pending ? t("Composer.submitting") : t("Composer.submit")}
            >
              {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
