"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
      setError("질문 처리에 실패했습니다.");
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

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)]">
      <div className="space-y-2">
        <label htmlFor="ask-question" className="block text-sm font-medium">
          질문
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>
      <Button disabled={pending} onClick={() => void submit()}>
        {pending ? "질문 중…" : "질문하기"}
      </Button>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {answer ? <AnswerCard text={answer} sources={sources} /> : null}
    </section>
  );
}
