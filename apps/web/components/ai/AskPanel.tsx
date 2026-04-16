"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { BotMessageSquare, GraduationCap, Loader2, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, Zap } from "lucide-react";
import type { AskMode, SourceRef } from "@jarvis/ai/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAskAI } from "@/lib/hooks/useAskAI";
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
}: AskPanelProps) {
  const router = useRouter();
  const [input, setInput] = useState(initialQuestion);
  const [activeScope, setActiveScope] = useState<{ id: string; title: string } | null>(initialScope);
  const [askMode, setAskMode] = useState<AskMode>('simple');
  const [history, setHistory] = useState<HistoryEntry[]>(initialMessages);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(initialConversationId);
  const { isStreaming, answer, sources, error, question, lane, feedbackSent, conversationId: hookConversationId, ask, reset, sendFeedback } = useAskAI();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // SSE conversation 이벤트로 새 conversationId를 수신했을 때 URL 갱신.
  useEffect(() => {
    if (hookConversationId && hookConversationId !== activeConversationId) {
      setActiveConversationId(hookConversationId);
      router.replace(`/ask/${hookConversationId}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookConversationId]);

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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {activeScope && (
          <Badge variant="outline" className="gap-1 py-1">
            <BotMessageSquare className="h-3 w-3 text-violet-500" />
            <span className="text-xs">그래프 범위: {activeScope.title}</span>
            <button
              type="button"
              onClick={() => setActiveScope(null)}
              aria-label="범위 해제"
              className="ml-1 rounded-sm opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </Badge>
        )}
        <button
          type="button"
          onClick={() => setAskMode(askMode === 'simple' ? 'expert' : 'simple')}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            askMode === 'expert'
              ? 'border-violet-300 bg-violet-50 text-violet-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {askMode === 'expert' ? (
            <><GraduationCap className="h-3 w-3" /> Expert</>
          ) : (
            <><Zap className="h-3 w-3" /> Simple</>
          )}
        </button>
      </div>
      <div className="relative flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
          className="min-h-[84px] max-h-[240px] resize-none border-0 bg-transparent px-1 py-1 pr-2 text-sm shadow-none focus-visible:ring-0"
          disabled={isStreaming}
        />
        <div className="flex shrink-0 gap-1.5 pb-0.5">
          {hasConversation && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleReset}
              title="대화 초기화"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => handleAsk(input)}
            disabled={isStreaming || !input.trim()}
            title="전송 (Enter)"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Jarvis는 지식 베이스에 등록된 내용을 바탕으로만 답변합니다.
      </p>
    </div>
  );

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
      {hasConversation ? (
        <>
          <ScrollArea className="min-h-0 flex-1 rounded-[28px] border border-gray-200 bg-white shadow-sm">
            <div className="space-y-6 p-5">
              {history.map((entry, index) => (
                <div key={`${entry.question}-${index}`} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
                      {entry.question}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                      J
                    </div>
                    <div className="flex-1">
                      <AnswerCard answer={entry.answer} sources={entry.sources} />
                    </div>
                  </div>

                  {index < history.length - 1 && <Separator />}
                </div>
              ))}

              {(isStreaming || answer) && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
                      {question}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                      J
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="prose prose-sm max-w-none text-sm leading-relaxed">
                        {answer ? (
                          <AnswerText text={answer} sources={sources} />
                        ) : (
                          <span className="animate-pulse text-xs text-muted-foreground">
                            답변을 생성하는 중...
                          </span>
                        )}
                        {isStreaming && (
                          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-text-bottom bg-blue-600" />
                        )}
                      </div>

                      {!isStreaming && sources.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <p className="text-xs font-medium text-muted-foreground">참고 문서</p>
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
                              <SourceRefCard key={`${keyPart}-${sourceIndex}`} source={source} index={sourceIndex} />
                            );
                          })}
                        </div>
                      )}

                      {!isStreaming && answer && (
                        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                          {lane && (
                            <span className="rounded-full border border-gray-200 px-2 py-0.5">
                              {lane}
                            </span>
                          )}
                          <span className="ml-auto">이 답변이 도움이 됐나요?</span>
                          <button
                            type="button"
                            onClick={() => sendFeedback('up')}
                            disabled={!!feedbackSent}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
                              feedbackSent === 'up'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                            title="도움됨"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => sendFeedback('down')}
                            disabled={!!feedbackSent}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
                              feedbackSent === 'down'
                                ? 'border-rose-300 bg-rose-50 text-rose-700'
                                : 'border-gray-200 hover:bg-gray-50'
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
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="pt-4">{composer}</div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-6 pb-4">
          <div className="rounded-[32px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-6 py-7 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg">
                <BotMessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">문서 기반 AI 어시스턴트</p>
                <p className="text-sm text-gray-600">
                  사내 문서와 운영 기록을 바탕으로 답변하고, 근거 문서를 바로 보여줍니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <p className="text-sm font-semibold text-gray-900">빠른 요약</p>
                </div>
                <p className="text-sm text-gray-600">
                  운영 정책, 프로젝트 문서, 런북 내용을 한 번에 요약합니다.
                </p>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  <p className="text-sm font-semibold text-gray-900">출처 인용</p>
                </div>
                <p className="text-sm text-gray-600">
                  답변마다 참고 문서를 붙여서 근거를 바로 확인할 수 있습니다.
                </p>
              </div>

              <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                  <p className="text-sm font-semibold text-gray-900">실시간 응답</p>
                </div>
                <p className="text-sm text-gray-600">
                  스트리밍으로 답변을 받아서 길게 기다리지 않고 바로 읽기 시작합니다.
                </p>
              </div>
            </div>
          </div>

          {featuredPrompts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">추천 질문</Badge>
                <p className="text-xs text-muted-foreground">자주 쓰는 질문으로 바로 시작하세요.</p>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                {featuredPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInput(prompt);
                      handleAsk(prompt);
                    }}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {composer}
        </div>
      )}
    </div>
  );
}
