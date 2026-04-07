// apps/web/components/ai/AskPanel.tsx
'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, RotateCcw } from 'lucide-react';
import { useAskAI } from '@/lib/hooks/useAskAI';
import { SourceRefCard } from './SourceRefCard';
import { ClaimBadge } from './ClaimBadge';
import type { SourceRef } from '@jarvis/ai/types';

interface HistoryEntry {
  question: string;
  answer: string;
  sources: SourceRef[];
}

interface AskPanelProps {
  initialQuestion?: string;
  popularQuestions?: string[];
}

// Render answer text, replacing [source:N] with ClaimBadge components
function AnswerText({ text, sources }: { text: string; sources: SourceRef[] }) {
  const parts = text.split(/(\[source:\d+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const match = part.match(/^\[source:(\d+)\]$/);
        if (match && match[1]) {
          return (
            <ClaimBadge
              key={i}
              sourceNumber={parseInt(match[1], 10)}
              sources={sources}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export function AskPanel({ initialQuestion = '', popularQuestions = [] }: AskPanelProps) {
  const [input, setInput] = useState(initialQuestion);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const { isStreaming, answer, sources, error, question, ask, reset } = useAskAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-submit when initialQuestion is provided (chip click)
  useEffect(() => {
    if (initialQuestion && initialQuestion.trim()) {
      setInput(initialQuestion);
      handleAsk(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  // Scroll to bottom while streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [answer]);

  // Archive current answer when stream completes
  useEffect(() => {
    if (!isStreaming && answer && question) {
      setHistory((prev) => {
        // Avoid duplicate on re-render
        if (prev[prev.length - 1]?.question === question) return prev;
        return [...prev, { question, answer, sources }];
      });
    }
  }, [isStreaming, answer, question, sources]);

  function handleAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed || isStreaming) return;
    ask(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAsk(input);
    }
  }

  function handleReset() {
    reset();
    setInput('');
    setHistory([]);
    textareaRef.current?.focus();
  }

  const hasContent = history.length > 0 || isStreaming || answer;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto gap-4">
      {/* Popular questions chips */}
      {!hasContent && popularQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {popularQuestions.map((q) => (
            <button
              key={q}
              onClick={() => {
                setInput(q);
                handleAsk(q);
              }}
              className="text-sm px-3 py-1.5 rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors text-left"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Conversation history */}
      {hasContent && (
        <ScrollArea className="flex-1 rounded-lg border bg-background">
          <div className="p-4 space-y-6">
            {history.map((entry, i) => (
              <div key={i} className="space-y-3">
                {/* Question */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                    {entry.question}
                  </div>
                </div>
                {/* Answer */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    J
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                      <AnswerText text={entry.answer} sources={entry.sources} />
                    </div>
                    {entry.sources.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-medium text-muted-foreground">참고 문서</p>
                        {entry.sources.map((src, si) => (
                          <SourceRefCard key={src.pageId} source={src} index={si} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {i < history.length - 1 && <Separator />}
              </div>
            ))}

            {/* Streaming answer */}
            {(isStreaming || (answer && !history.find((h) => h.question === question))) && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                    {question}
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    J
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                      {answer ? (
                        <AnswerText text={answer} sources={sources} />
                      ) : (
                        <span className="text-muted-foreground text-xs animate-pulse">
                          답변을 생성하는 중...
                        </span>
                      )}
                      {isStreaming && (
                        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />
                      )}
                    </div>
                    {!isStreaming && sources.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-medium text-muted-foreground">참고 문서</p>
                        {sources.map((src, si) => (
                          <SourceRefCard key={src.pageId} source={src} index={si} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input area */}
      <div className="space-y-2">
        <div className="relative flex items-end gap-2 rounded-xl border bg-background shadow-sm p-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요... (Ctrl+Enter로 전송)"
            className="min-h-[60px] max-h-[200px] resize-none border-0 shadow-none focus-visible:ring-0 pr-2 text-sm"
            disabled={isStreaming}
          />
          <div className="flex gap-1.5 flex-shrink-0 pb-0.5">
            {hasContent && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleReset}
                title="대화 초기화"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAsk(input)}
              disabled={isStreaming || !input.trim()}
              title="전송 (Ctrl+Enter)"
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Jarvis는 지식 베이스에 등록된 내용만을 바탕으로 답변합니다.
        </p>
      </div>
    </div>
  );
}
