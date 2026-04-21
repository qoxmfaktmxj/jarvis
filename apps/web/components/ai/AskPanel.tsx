"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BotMessageSquare, GraduationCap, Loader2, RotateCcw, Send, ThumbsDown, ThumbsUp, Zap } from "lucide-react";
import type { AskMode, SourceRef } from "@jarvis/ai/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAskAI } from "@/lib/hooks/useAskAI";
import { Capy } from "@/components/layout/Capy";
import { GlobeLoader } from "@/components/layout/GlobeLoader";
import { AnswerCard } from "./AnswerCard";
import { ClaimBadge } from "./ClaimBadge";
import { SourceRefCard } from "./SourceRefCard";

export interface HistoryEntry {
  question: string;
  answer: string;
  sources: SourceRef[];
}

interface AskPanelProps {
  initialQuestion?: string;
  initialScope?: { id: string; title: string } | null;
  popularQuestions?: string[];
  /** 기존 대화 복원 시 conversationId. undefined이면 새 대화. */
  conversationId?: string;
  /** 기존 대화 복원 시 서버에서 로드한 메시지 히스토리. */
  initialMessages?: HistoryEntry[];
  /** session workspaceId — Wiki source link 생성에 사용. */
  workspaceId: string;
}

function AnswerText({ text, sources }: { text: string; sources: SourceRef[] }) {
  const parts = text.split(/(\[source:\d+\])/g);

  return (
    <span>
      {parts.map((part, index) => {
        const match = part.match(/^\[source:(\d+)\]$/);
        if (match?.[1]) {
          return (
            <ClaimBadge
              key={index}
              sourceNumber={parseInt(match[1], 10)}
              sources={sources}
            />
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

export function AskPanel({
  initialQuestion = "",
  initialScope = null,
  popularQuestions = [],
  conversationId: initialConversationId,
  initialMessages = [],
  workspaceId,
}: AskPanelProps) {
  const router = useRouter();
  const tThinking = useTranslations("Ask.thinking");
  const [input, setInput] = useState(initialQuestion);
  const [activeScope, setActiveScope] = useState<{ id: string; title: string } | null>(initialScope);
  const [askMode, setAskMode] = useState<AskMode>('simple');
  const [history, setHistory] = useState<HistoryEntry[]>(initialMessages);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(initialConversationId);
  const { isStreaming, answer, sources, error, question, lane, feedbackSent, conversationId: hookConversationId, ask, reset, sendFeedback } = useAskAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingNavRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialQuestion && initialQuestion.trim()) {
      setInput(initialQuestion);
      handleAsk(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answer]);

  // SSE conversation 이벤트 수신 시 activeConversationId 즉시 갱신 (다음 메시지 전송에 필요).
  // router.replace는 스트리밍 완료 후 별도 effect에서 처리 — 진행 중에 navigate하면
  // Server Component가 새 AskPanel 인스턴스를 마운트해 스트리밍 상태가 소멸됨.
  useEffect(() => {
    if (hookConversationId && hookConversationId !== activeConversationId) {
      setActiveConversationId(hookConversationId);
      pendingNavRef.current = hookConversationId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookConversationId]);

  // 스트리밍 완료 후 URL을 새 conversationId로 교체.
  useEffect(() => {
    if (!isStreaming && pendingNavRef.current) {
      router.replace(`/ask/${pendingNavRef.current}`, { scroll: false });
      pendingNavRef.current = null;
    }
  }, [isStreaming, router]);

  // history 이동은 "새 질문이 들어오는 시점"에만 한다.
  // 답변 완료 직후 live 블록을 없애면 피드백 버튼이 즉시 사라지므로,
  // 다음 질문을 보낼 때까지 live 블록(+ 피드백 버튼)을 유지한다.
  function handleAsk(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    if (answer && question && question !== trimmed) {
      setHistory((prev) => {
        if (prev[prev.length - 1]?.question === question) return prev;
        return [...prev, { question, answer, sources }];
      });
    }

    ask(trimmed, {
      snapshotId: activeScope?.id,
      mode: askMode,
      conversationId: activeConversationId,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handleAsk(input);
    }
  }

  function handleReset() {
    reset();
    setInput("");
    setHistory([]);
    setActiveConversationId(undefined);
    textareaRef.current?.focus();
    // 새 대화로 전환 — URL도 /ask 로 복귀
    router.push("/ask");
  }

  const hasConversation = history.length > 0 || isStreaming || answer || !!error;
  const featuredPrompts = popularQuestions.slice(0, 3);

  const composer = (
    <div className="space-y-2.5">
      {/* Scope / mode chips — compact hairline row */}
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setAskMode(askMode === 'simple' ? 'expert' : 'simple')}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-colors duration-150 ${
            askMode === 'expert'
              ? 'border-isu-300 bg-isu-50 text-isu-700'
              : 'border-surface-200 bg-card text-surface-700 hover:border-surface-300 hover:bg-surface-50'
          }`}
          title={askMode === 'expert' ? '전문가 모드 — 기술 세부까지' : '일반 모드 — 요약 위주'}
        >
          {askMode === 'expert' ? (
            <>
              <GraduationCap className="h-3 w-3" aria-hidden /> Expert
            </>
          ) : (
            <>
              <Zap className="h-3 w-3" aria-hidden /> Simple
            </>
          )}
        </button>

        {activeScope ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-card px-2 py-1 text-surface-700">
            <BotMessageSquare className="h-3 w-3 text-isu-500" aria-hidden />
            <span className="text-display text-[10px] font-semibold uppercase tracking-wide text-surface-400">
              Graph
            </span>
            <span className="max-w-[180px] truncate">{activeScope.title}</span>
            <button
              type="button"
              onClick={() => setActiveScope(null)}
              aria-label="범위 해제"
              className="ml-0.5 rounded text-surface-400 hover:text-surface-700"
            >
              ✕
            </button>
          </span>
        ) : null}

        <span className="ml-auto text-[11px] text-surface-400">
          Enter 전송 · Shift+Enter 줄바꿈
        </span>
      </div>

      {/* Composer — hairline, flush textarea */}
      <div className="relative flex items-end gap-2 rounded-xl border border-surface-200 bg-card p-2.5 transition-colors duration-150 focus-within:border-isu-300 focus-within:ring-1 focus-within:ring-isu-200">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="무엇이든 물어보세요…"
          className="min-h-[72px] max-h-[240px] resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0"
          disabled={isStreaming}
        />
        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          {hasConversation && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-surface-500 hover:text-surface-800"
              onClick={handleReset}
              title="대화 초기화"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => handleAsk(input)}
            disabled={isStreaming || !input.trim()}
            title="전송 (Enter)"
          >
            {isStreaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <p className="text-center text-[11px] text-surface-400">
        Jarvis는 지식 베이스에 등록된 내용만 근거로 답합니다.
      </p>
    </div>
  );

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
      {hasConversation ? (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto max-w-3xl space-y-8 py-6 pr-4">
              {history.map((entry, index) => (
                <div key={`${entry.question}-${index}`} className="space-y-4">
                  {/* User turn — right-aligned monochrome bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-surface-100 px-3.5 py-2 text-sm leading-relaxed text-surface-800">
                      {entry.question}
                    </div>
                  </div>

                  {/* Assistant turn — full-width flow */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-display text-[10px] font-semibold uppercase tracking-[0.18em] text-isu-600">
                        Jarvis
                      </span>
                      <span className="h-px flex-1 bg-surface-200" aria-hidden />
                    </div>
                    <AnswerCard answer={entry.answer} sources={entry.sources} />
                  </div>
                </div>
              ))}

              {(isStreaming || answer) && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-surface-100 px-3.5 py-2 text-sm leading-relaxed text-surface-800">
                      {question}
                    </div>
                  </div>

                  <div className="relative">
                    {!isStreaming && answer && !feedbackSent ? (
                      <Capy
                        name="watermelon"
                        size={56}
                        className="pointer-events-none absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 drop-shadow-sm opacity-0 animate-[popIn_420ms_ease-out_forwards]"
                      />
                    ) : null}
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`text-display text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          isStreaming ? 'text-isu-500' : 'text-isu-600'
                        }`}
                      >
                        {isStreaming ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-isu-400 opacity-60" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-isu-500" />
                            </span>
                            Thinking
                          </span>
                        ) : (
                          'Jarvis'
                        )}
                      </span>
                      <span className="h-px flex-1 bg-surface-200" aria-hidden />
                    </div>
                    <div className="space-y-3">
                      {isStreaming && !answer ? (
                        <div className="flex items-center gap-3 py-1">
                          <GlobeLoader
                            size={40}
                            tone="ocean"
                            label={tThinking("documentReview")}
                          />
                        </div>
                      ) : null}
                      <div className="prose prose-sm max-w-none text-sm leading-relaxed text-surface-800">
                        {answer ? (
                          <AnswerText text={answer} sources={sources} />
                        ) : null}
                        {isStreaming && answer && (
                          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse align-text-bottom bg-isu-600" />
                        )}
                      </div>

                      {!isStreaming && sources.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
                              참고 문서
                            </span>
                            <span className="text-display text-[11px] font-semibold tabular-nums text-surface-400">
                              {sources.length}
                            </span>
                            <span className="h-px flex-1 bg-surface-200" aria-hidden />
                          </div>
                          {sources.map((source, sourceIndex) => {
                            const keyPart =
                              source.kind === 'text'
                                ? source.pageId
                                : source.kind === 'graph'
                                  ? source.nodeId
                                  : source.kind === 'case'
                                    ? source.caseId
                                    : source.kind === 'directory'
                                      ? source.entryId
                                      : source.kind === 'wiki-page'
                                        ? source.pageId
                                        : String(sourceIndex);
                            return (
                              <SourceRefCard key={`${keyPart}-${sourceIndex}`} source={source} index={sourceIndex} workspaceId={workspaceId} />
                            );
                          })}
                        </div>
                      )}

                      {!isStreaming && answer && (
                        <div className="flex items-center gap-2 pt-2 text-xs">
                          {lane ? (
                            <span className="text-display text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-400">
                              lane · {lane}
                            </span>
                          ) : null}
                          <span className="ml-auto text-surface-500">이 답변이 도움이 됐나요?</span>
                          <button
                            type="button"
                            onClick={() => sendFeedback('up')}
                            disabled={!!feedbackSent}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors duration-150 ${
                              feedbackSent === 'up'
                                ? 'border-lime-300 bg-lime-50 text-lime-700'
                                : 'border-surface-200 text-surface-500 hover:bg-surface-100 hover:text-surface-700'
                            }`}
                            title="도움됨"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => sendFeedback('down')}
                            disabled={!!feedbackSent}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors duration-150 ${
                              feedbackSent === 'down'
                                ? 'border-danger/40 bg-danger/10 text-danger'
                                : 'border-surface-200 text-surface-500 hover:bg-surface-100 hover:text-surface-700'
                            }`}
                            title="도움 안 됨"
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 border-l-2 border-danger bg-danger/5 px-3 py-2 text-sm text-danger">
                  <span className="text-display text-[10px] font-semibold uppercase tracking-wide">
                    Error
                  </span>
                  <span className="flex-1">{error}</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="mx-auto w-full max-w-3xl pt-4">{composer}</div>
        </>
      ) : (
        <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-end gap-8 pb-4">
          <header className="space-y-2">
            <p className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-isu-600">
              문서 기반 AI 어시스턴트
            </p>
            <h2 className="text-display text-2xl font-bold tracking-tight text-surface-900 sm:text-3xl">
              무엇이 궁금하신가요?
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-surface-600">
              사내 문서와 운영 기록을 근거로 답변하고, 인용 문서를 함께 보여줍니다.
            </p>
          </header>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[5rem_1fr]">
            <dt className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
              요약
            </dt>
            <dd className="text-surface-700">
              운영 정책, 프로젝트 문서, 런북을 한 번에 요약합니다.
            </dd>

            <dt className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
              인용
            </dt>
            <dd className="text-surface-700">
              답변마다 참고 문서를 붙여 근거를 바로 확인할 수 있습니다.
            </dd>

            <dt className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
              스트리밍
            </dt>
            <dd className="text-surface-700">
              길게 기다리지 않고, 답변이 생성되는 동안 바로 읽기 시작합니다.
            </dd>
          </dl>

          {featuredPrompts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
                  추천 질문
                </span>
                <span className="h-px flex-1 bg-surface-200" aria-hidden />
              </div>

              <div className="grid gap-1.5 md:grid-cols-1">
                {featuredPrompts.map((prompt, i) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      handleAsk(prompt);
                    }}
                    className="group flex items-start gap-3 rounded-md border border-transparent px-2 py-2 text-left transition-colors duration-150 hover:border-surface-200 hover:bg-surface-50"
                  >
                    <span className="text-display mt-0.5 w-6 shrink-0 text-[11px] font-semibold tabular-nums text-surface-400 group-hover:text-isu-500">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-sm text-surface-700 group-hover:text-surface-900">
                      {prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {composer}
        </section>
      )}
    </div>
  );
}
