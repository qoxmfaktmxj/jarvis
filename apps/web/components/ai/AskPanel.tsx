"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BotMessageSquare, Loader2, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, Zap } from "lucide-react";
import type { SourceRef } from "@jarvis/ai/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAskAI } from "@/lib/hooks/useAskAI";
import { Capy } from "@/components/layout/Capy";
import { GlobeLoader } from "@/components/layout/GlobeLoader";
import { AnswerCard } from "./AnswerCard";
import { ClaimBadge } from "./ClaimBadge";
import { SourceRefCard } from "./SourceRefCard";
import { AskModelPopover, type AskModelOption } from "./AskModelPopover";
import { AskContextGauge } from "./AskContextGauge";
import { getModelContextWindow } from "@/lib/ai/model-windows";
import { getConversationTokenUsageAction } from "@/app/(app)/ask/actions";

type AskModel = "gpt-5.4-mini" | "gpt-5.5";
const ASK_MODEL_STORAGE_KEY = "jarvis.ask.model";
const ASK_MODEL_DEFAULT: AskModel = "gpt-5.5";

const ASK_MODEL_OPTIONS: AskModelOption[] = [
  { value: "gpt-5.5", label: "GPT-5.5", description: "최고 정밀 · 기본", icon: Sparkles },
  { value: "gpt-5.4-mini", label: "Mini", description: "빠름", icon: Zap },
];

function isAskModel(v: string): v is AskModel {
  return v === "gpt-5.5" || v === "gpt-5.4-mini";
}

function readStoredModel(): AskModel {
  if (typeof window === "undefined") return ASK_MODEL_DEFAULT;
  const stored = window.localStorage.getItem(ASK_MODEL_STORAGE_KEY);
  return isAskModel(stored ?? "") ? (stored as AskModel) : ASK_MODEL_DEFAULT;
}

export interface HistoryEntry {
  question: string;
  answer: string;
  sources: SourceRef[];
}

export interface InitialTokenUsage {
  usedTokens: number;
  messageCount: number;
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
  /** 기존 대화 복원 시 서버에서 미리 집계한 누적 토큰. 없으면 0. */
  initialTokenUsage?: InitialTokenUsage | null;
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
  initialTokenUsage = null,
}: AskPanelProps) {
  const router = useRouter();
  const tThinking = useTranslations("Ask.thinking");
  const [input, setInput] = useState(initialQuestion);
  const [activeScope, setActiveScope] = useState<{ id: string; title: string } | null>(initialScope);
  // 모델 선택은 localStorage에 기억. SSR/CSR 일관성을 위해 mount 후 반영.
  const [selectedModel, setSelectedModelState] = useState<AskModel>(ASK_MODEL_DEFAULT);
  useEffect(() => {
    const stored = readStoredModel();
    if (stored !== ASK_MODEL_DEFAULT) setSelectedModelState(stored);
  }, []);
  const setSelectedModel = useCallback((next: string) => {
    if (!isAskModel(next)) return;
    setSelectedModelState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ASK_MODEL_STORAGE_KEY, next);
    }
  }, []);
  const [usedTokens, setUsedTokens] = useState<number>(
    initialTokenUsage?.usedTokens ?? 0,
  );
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

  // 스트리밍 완료 후 누적 토큰 사용량 재조회 (toolbar context gauge).
  useEffect(() => {
    if (isStreaming || !answer || !activeConversationId) return;
    let cancelled = false;
    getConversationTokenUsageAction(activeConversationId)
      .then((r) => {
        if (!cancelled) setUsedTokens(r.usedTokens);
      })
      .catch(() => {
        // 게이지는 장식적 정보이므로 실패 시 기존 값 유지
      });
    return () => {
      cancelled = true;
    };
  }, [isStreaming, answer, activeConversationId]);

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
      model: selectedModel,
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
    setUsedTokens(0);
    textareaRef.current?.focus();
    // 새 대화로 전환 — URL도 /ask 로 복귀
    router.push("/ask");
  }

  const hasConversation = history.length > 0 || isStreaming || answer || !!error;
  const featuredPrompts = popularQuestions.slice(0, 3);

  const totalWindow = getModelContextWindow(selectedModel);
  const showGauge = Boolean(activeConversationId) || usedTokens > 0;

  const composer = (
    <div className="space-y-2">
      {/* Composer — hairline textarea only */}
      <div className="relative rounded-xl border border-[--border-default] bg-card transition-colors duration-150 focus-within:border-[--brand-primary] focus-within:ring-1 focus-within:ring-[--brand-primary-bg]">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="무엇이든 물어보세요…"
          className="min-h-[72px] max-h-[240px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm leading-relaxed shadow-none focus-visible:ring-0"
          disabled={isStreaming}
        />
      </div>

      {/* Toolbar — below composer, Claude Desktop 스타일 */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <AskModelPopover
          value={selectedModel}
          onChange={setSelectedModel}
          options={ASK_MODEL_OPTIONS}
        />

        {activeScope ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[--border-default] bg-card px-2 py-1 text-[--fg-primary]">
            <BotMessageSquare className="h-3 w-3 text-[--brand-primary]" aria-hidden />
            <span className="text-display text-[10px] font-semibold uppercase tracking-wide text-[--fg-muted]">
              Graph
            </span>
            <span className="max-w-[160px] truncate">{activeScope.title}</span>
            <button
              type="button"
              onClick={() => setActiveScope(null)}
              aria-label="범위 해제"
              className="ml-0.5 rounded text-[--fg-muted] hover:text-[--fg-primary]"
            >
              ✕
            </button>
          </span>
        ) : null}

        {showGauge ? (
          <AskContextGauge
            usedTokens={usedTokens}
            totalWindow={totalWindow}
          />
        ) : null}

        <span className="ml-auto hidden text-[11px] text-[--fg-muted] sm:inline">
          Enter 전송 · Shift+Enter 줄바꿈
        </span>

        <div className="flex items-center gap-1">
          {hasConversation && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[--fg-secondary] hover:text-[--fg-primary]"
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
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {hasConversation ? (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto max-w-3xl space-y-8 py-4 pr-4">
              {history.map((entry, index) => (
                <div key={`${entry.question}-${index}`} className="space-y-4">
                  {/* User turn — right-aligned monochrome bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[--bg-surface] px-3.5 py-2 text-sm leading-relaxed text-[--fg-primary]">
                      {entry.question}
                    </div>
                  </div>

                  {/* Assistant turn — full-width flow */}
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-display text-[10px] font-semibold uppercase tracking-[0.18em] text-[--brand-primary-text]">
                        Jarvis
                      </span>
                      <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
                    </div>
                    <AnswerCard answer={entry.answer} sources={entry.sources} workspaceId={workspaceId} />
                  </div>
                </div>
              ))}

              {(isStreaming || answer) && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[--bg-surface] px-3.5 py-2 text-sm leading-relaxed text-[--fg-primary]">
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
                          isStreaming ? 'text-[--brand-primary]' : 'text-[--brand-primary-text]'
                        }`}
                      >
                        {isStreaming ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[--brand-primary] opacity-60" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[--brand-primary]" />
                            </span>
                            Thinking
                          </span>
                        ) : (
                          'Jarvis'
                        )}
                      </span>
                      <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
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
                      <div className="prose prose-sm max-w-none text-sm leading-relaxed text-[--fg-primary]">
                        {answer ? (
                          <AnswerText text={answer} sources={sources} />
                        ) : null}
                        {isStreaming && answer && (
                          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse align-text-bottom bg-[--brand-primary-text]" />
                        )}
                      </div>

                      {!isStreaming && sources.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
                              참고 문서
                            </span>
                            <span className="text-display text-[11px] font-semibold tabular-nums text-[--fg-muted]">
                              {sources.length}
                            </span>
                            <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
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
                            <span className="text-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[--fg-muted]">
                              lane · {lane}
                            </span>
                          ) : null}
                          <span className="ml-auto text-[--fg-secondary]">이 답변이 도움이 됐나요?</span>
                          <button
                            type="button"
                            onClick={() => sendFeedback('up')}
                            disabled={!!feedbackSent}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors duration-150 ${
                              feedbackSent === 'up'
                                ? 'border-[--status-success-fg]/40 bg-[--status-success-bg] text-[--status-success-fg]'
                                : 'border-[--border-default] text-[--fg-secondary] hover:bg-[--bg-surface] hover:text-[--fg-primary]'
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
                                : 'border-[--border-default] text-[--fg-secondary] hover:bg-[--bg-surface] hover:text-[--fg-primary]'
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
        <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-end gap-6 pb-4">
          <header className="space-y-2">
            <p className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[--brand-primary-text]">
              문서 기반 AI 어시스턴트
            </p>
            <h2 className="text-display text-2xl font-bold tracking-tight text-[--fg-primary] sm:text-3xl">
              무엇이 궁금하신가요?
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-[--fg-secondary]">
              사내 문서와 운영 기록을 근거로 답변하고, 인용 문서를 함께 보여줍니다.
            </p>
          </header>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[5rem_1fr]">
            <dt className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
              요약
            </dt>
            <dd className="text-[--fg-primary]">
              운영 정책, 프로젝트 문서, 런북을 한 번에 요약합니다.
            </dd>

            <dt className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
              인용
            </dt>
            <dd className="text-[--fg-primary]">
              답변마다 참고 문서를 붙여 근거를 바로 확인할 수 있습니다.
            </dd>

            <dt className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
              스트리밍
            </dt>
            <dd className="text-[--fg-primary]">
              길게 기다리지 않고, 답변이 생성되는 동안 바로 읽기 시작합니다.
            </dd>
          </dl>

          {featuredPrompts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
                  추천 질문
                </span>
                <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
              </div>

              <div className="grid gap-1.5 md:grid-cols-1">
                {featuredPrompts.map((prompt, i) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      handleAsk(prompt);
                    }}
                    className="group flex items-start gap-3 rounded-md border border-transparent px-2 py-2 text-left transition-colors duration-150 hover:border-[--border-default] hover:bg-[--bg-surface]"
                  >
                    <span className="text-display mt-0.5 w-6 shrink-0 text-[11px] font-semibold tabular-nums text-[--fg-muted] group-hover:text-[--brand-primary]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-sm text-[--fg-primary] group-hover:text-[--fg-primary]">
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
