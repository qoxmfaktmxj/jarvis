'use client';

import { ChevronLeft, X } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { mapDbRowToWikiPage, WikiPageView, type WikiPage } from '@/components/WikiPageView';

type WikiPanelProps = {
  workspaceId: string;
  slug: string;
  onClose: () => void;
};

type LoadedPage = {
  page: WikiPage;
  orphanSlugs: readonly string[];
};

type Status =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: LoadedPage };

/**
 * /ask split pane 우측에 인라인으로 렌더되는 wiki viewer.
 * navigate stack: 현재 보고 있는 슬러그 + history. wikilink 클릭은 push, 뒤로가기 버튼은 pop.
 */
export function WikiPanel({ workspaceId, slug, onClose }: WikiPanelProps) {
  // 첫 진입 슬러그를 stack 첫 항목으로 초기화. props.slug가 변하면 stack을 reset(새 source 클릭).
  const [stack, setStack] = useState<string[]>([slug]);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const current = stack[stack.length - 1] ?? slug;

  useEffect(() => {
    setStack([slug]);
  }, [slug]);

  useEffect(() => {
    let aborted = false;
    setStatus({ kind: 'loading' });
    const path = current.endsWith('.md') ? current : `${current}.md`;
    const url = `/api/wiki/page?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`;
    fetch(url, { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) {
          if (aborted) return;
          if (r.status === 403) setStatus({ kind: 'error', message: '접근 권한이 없습니다 (403).' });
          else if (r.status === 404) setStatus({ kind: 'error', message: '페이지를 찾을 수 없습니다 (404).' });
          else setStatus({ kind: 'error', message: `오류 (${r.status}).` });
          return;
        }
        const json = (await r.json()) as {
          meta: Record<string, unknown>;
          body: string;
          orphanSlugs?: string[];
        };
        if (aborted) return;
        // API JSON 직렬화로 updatedAt이 ISO string이 됨 — Date로 복원
        const metaRow = {
          ...json.meta,
          updatedAt: new Date(json.meta.updatedAt as string),
        } as Parameters<typeof mapDbRowToWikiPage>[0];
        const page = mapDbRowToWikiPage(metaRow, json.body);
        setStatus({ kind: 'ready', data: { page, orphanSlugs: json.orphanSlugs ?? [] } });
      })
      .catch((err) => {
        if (aborted) return;
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'unknown error' });
      });
    return () => {
      aborted = true;
    };
  }, [current, workspaceId]);

  const onWikiLinkClick = useCallback((target: string) => {
    setStack((s) => [...s, target]);
  }, []);

  const onBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const canGoBack = stack.length > 1;

  return (
    <section aria-label="위키 페이지" className="flex h-full w-full flex-col bg-white">
      <header className="flex shrink-0 items-center gap-2 border-b border-[--border-default] px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="뒤로"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[--fg-secondary] transition-colors duration-150 hover:bg-[--bg-surface] hover:text-[--fg-primary] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="flex-1 truncate text-sm font-medium text-[--fg-primary]">
          {status.kind === 'ready' ? status.data.page.title : '위키 페이지'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[--fg-secondary] transition-colors duration-150 hover:bg-[--bg-surface] hover:text-[--fg-primary]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {status.kind === 'loading' && (
          <p className="text-sm text-[--fg-muted]">불러오는 중…</p>
        )}
        {status.kind === 'error' && (
          <p className="text-sm text-[--color-red-500]">{status.message}</p>
        )}
        {status.kind === 'ready' && (
          <WikiPageView
            page={status.data.page}
            orphanSlugs={status.data.orphanSlugs}
            onWikiLinkClick={onWikiLinkClick}
          />
        )}
      </div>
    </section>
  );
}
