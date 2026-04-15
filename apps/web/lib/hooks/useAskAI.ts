"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SSEEvent, SourceRef } from "@jarvis/ai/types";

export interface AskAIState {
  isStreaming: boolean;
  answer: string;
  sources: SourceRef[];
  error: string | null;
  question: string;
  lane: string | null;
  totalTokens: number | null;
  feedbackSent: 'up' | 'down' | null;
}

export interface UseAskAIReturn extends AskAIState {
  ask: (question: string, opts?: { snapshotId?: string; mode?: 'simple' | 'expert' }) => void;
  reset: () => void;
  sendFeedback: (rating: 'up' | 'down', comment?: string) => Promise<void>;
}

const initialState: AskAIState = {
  isStreaming: false,
  answer: "",
  sources: [],
  error: null,
  question: "",
  lane: null,
  totalTokens: null,
  feedbackSent: null,
};

export function useAskAI(): UseAskAIReturn {
  const [state, setState] = useState<AskAIState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  const ask = useCallback((question: string, opts?: { snapshotId?: string; mode?: 'simple' | 'expert' }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      isStreaming: true,
      answer: "",
      sources: [],
      error: null,
      question,
      lane: null,
      totalTokens: null,
      feedbackSent: null,
    });

    (async () => {
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, snapshotId: opts?.snapshotId, mode: opts?.mode }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));

          if (response.status === 429) {
            const retryAfter = data.retryAfter as number | undefined;
            const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 60;
            setState((current) => ({
              ...current,
              isStreaming: false,
              error: `요청 한도를 초과했습니다. ${minutes}분 뒤에 다시 시도해 주세요.`,
            }));
          } else {
            setState((current) => ({
              ...current,
              isStreaming: false,
              error: data.error ?? `Request failed: ${response.status}`,
            }));
          }

          return;
        }

        if (!response.body) {
          setState((current) => ({
            ...current,
            isStreaming: false,
            error: "No response body",
          }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) {
              continue;
            }

            const jsonStr = line.slice("data:".length).trim();
            if (!jsonStr) {
              continue;
            }

            let event: SSEEvent;
            try {
              event = JSON.parse(jsonStr) as SSEEvent;
            } catch {
              continue;
            }

            if (event.type === "text") {
              setState((current) => ({
                ...current,
                answer: current.answer + event.content,
              }));
            } else if (event.type === "sources") {
              setState((current) => ({
                ...current,
                sources: event.sources,
              }));
            } else if (event.type === "route") {
              setState((current) => ({
                ...current,
                lane: event.lane,
              }));
            } else if (event.type === "done") {
              setState((current) => ({
                ...current,
                isStreaming: false,
                totalTokens: event.totalTokens,
              }));
            } else if (event.type === "error") {
              setState((current) => ({
                ...current,
                isStreaming: false,
                error: event.message,
              }));
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setState((current) => ({
          ...current,
          isStreaming: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      }
    })();
  }, []);

  const sendFeedback = useCallback(async (rating: 'up' | 'down', comment?: string) => {
    const snapshot = stateRef.current;
    if (!snapshot.question || snapshot.feedbackSent) return;
    try {
      const sourceRefs = snapshot.sources
        .slice(0, 20)
        .map((s) => {
          if (s.kind === 'text') return `text:${s.pageId}`;
          if (s.kind === 'graph') return `graph:${s.nodeId}`;
          if (s.kind === 'case') return `case:${s.caseId}`;
          if (s.kind === 'directory') return `directory:${s.entryId}`;
          if (s.kind === 'wiki-page') return `wiki-page:${s.pageId}`;
          return `chunk:${s.chunkId}`;
        });

      const res = await fetch('/api/ask/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: snapshot.question,
          answerPreview: snapshot.answer.slice(0, 300),
          lane: snapshot.lane ?? undefined,
          sourceRefs,
          rating,
          comment,
          totalTokens: snapshot.totalTokens ?? undefined,
        }),
      });
      if (res.ok) {
        setState((cur) => ({ ...cur, feedbackSent: rating }));
      }
    } catch {
      // best-effort, silent fail
    }
  }, []);

  return { ...state, ask, reset, sendFeedback };
}
