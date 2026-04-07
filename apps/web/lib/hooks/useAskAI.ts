// apps/web/lib/hooks/useAskAI.ts
'use client';

import { useState, useCallback, useRef } from 'react';
import type { SourceRef, SSEEvent } from '@jarvis/ai/types';

export interface AskAIState {
  isStreaming: boolean;
  answer: string;
  sources: SourceRef[];
  error: string | null;
  question: string;
}

export interface UseAskAIReturn extends AskAIState {
  ask: (question: string) => void;
  reset: () => void;
}

const initialState: AskAIState = {
  isStreaming: false,
  answer: '',
  sources: [],
  error: null,
  question: '',
};

export function useAskAI(): UseAskAIReturn {
  const [state, setState] = useState<AskAIState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  const ask = useCallback((question: string) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      isStreaming: true,
      answer: '',
      sources: [],
      error: null,
      question,
    });

    (async () => {
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (response.status === 429) {
            const retryAfter = data.retryAfter as number | undefined;
            const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 60;
            setState((s) => ({
              ...s,
              isStreaming: false,
              error: `요청 한도를 초과했습니다. ${minutes}분 후 다시 시도해 주세요.`,
            }));
          } else {
            setState((s) => ({
              ...s,
              isStreaming: false,
              error: data.error ?? `Request failed: ${response.status}`,
            }));
          }
          return;
        }

        if (!response.body) {
          setState((s) => ({ ...s, isStreaming: false, error: 'No response body' }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE lines are separated by "\n\n"
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? ''; // last part may be incomplete

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const jsonStr = line.slice('data:'.length).trim();
            if (!jsonStr) continue;

            let event: SSEEvent;
            try {
              event = JSON.parse(jsonStr) as SSEEvent;
            } catch {
              continue;
            }

            if (event.type === 'text') {
              setState((s) => ({ ...s, answer: s.answer + event.content }));
            } else if (event.type === 'sources') {
              setState((s) => ({ ...s, sources: event.sources }));
            } else if (event.type === 'done') {
              setState((s) => ({ ...s, isStreaming: false }));
            } else if (event.type === 'error') {
              setState((s) => ({ ...s, isStreaming: false, error: event.message }));
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // user cancelled
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    })();
  }, []);

  return { ...state, ask, reset };
}
