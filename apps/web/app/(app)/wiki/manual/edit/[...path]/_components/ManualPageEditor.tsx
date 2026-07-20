"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { saveManualPage } from "../actions";

export function ManualPageEditor(props: {
  path: string;
  title: string;
  body: string;
  pageType: "concept" | "guide" | "case" | "source";
  publishedStatus: "draft" | "published" | "archived";
}) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [body, setBody] = useState(props.body);
  const [pageType, setPageType] = useState(props.pageType);
  const [publishedStatus, setPublishedStatus] = useState(props.publishedStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const result = await saveManualPage({
      path: props.path,
      title,
      body,
      pageType,
      publishedStatus,
    });
    if (result.ok) {
      setMessage(`저장 완료: ${result.commitSha}`);
      router.refresh();
    } else {
      setMessage(`커밋은 완료되었지만 projection 큐 등록에 실패했습니다. 수동 복구: pnpm wiki:project (${result.commitSha})`);
    }
    setBusy(false);
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-5 shadow-[var(--shadow-soft)]">
      <div>
        <label htmlFor="manual-title" className="mb-1 block text-sm font-medium">
          제목
        </label>
        <input
          id="manual-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-10 w-full rounded-md border border-[var(--border-default)] px-3 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="manual-page-type" className="mb-1 block text-sm font-medium">
            페이지 유형
          </label>
          <select
            id="manual-page-type"
            value={pageType}
            onChange={(event) => setPageType(event.target.value as typeof pageType)}
            className="h-10 w-full rounded-md border border-[var(--border-default)] px-3"
          >
            <option value="concept">concept</option>
            <option value="guide">guide</option>
            <option value="case">case</option>
            <option value="source">source</option>
          </select>
        </div>
        <div>
          <label htmlFor="manual-status" className="mb-1 block text-sm font-medium">
            상태
          </label>
          <select
            id="manual-status"
            value={publishedStatus}
            onChange={(event) => setPublishedStatus(event.target.value as typeof publishedStatus)}
            className="h-10 w-full rounded-md border border-[var(--border-default)] px-3"
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="manual-body" className="mb-1 block text-sm font-medium">
          본문
        </label>
        <textarea
          id="manual-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={18}
          className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>
      <Button disabled={busy} onClick={() => void submit()}>
        {busy ? "저장 중…" : "저장"}
      </Button>
      {message ? <p className="text-sm text-[var(--fg-secondary)]">{message}</p> : null}
    </section>
  );
}
