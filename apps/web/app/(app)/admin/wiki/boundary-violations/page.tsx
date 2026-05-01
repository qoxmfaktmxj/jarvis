/**
 * apps/web/app/(app)/admin/wiki/boundary-violations/page.tsx
 *
 * Phase-W3 v4-W3-T1 — admin dashboard for wiki auto/manual boundary violations.
 */

import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@jarvis/db/client";
import { wikiReviewQueue } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/PageHeader";
import { DataTableShell } from "@/components/patterns/DataTableShell";
import { EmptyState } from "@/components/patterns/EmptyState";

const PAGE_SIZE = 50;

interface BoundaryViolationPayload {
  kind?: "llm_wrote_manual" | "human_wrote_auto" | string;
  path?: string;
  author?: string;
  commitSha?: string;
  timestamp?: number;
}

function readPayload(raw: unknown): BoundaryViolationPayload {
  if (raw && typeof raw === "object") {
    return raw as BoundaryViolationPayload;
  }
  return {};
}

function violationLabel(kind: string | undefined): string {
  if (kind === "llm_wrote_manual") return "LLM → manual";
  if (kind === "human_wrote_auto") return "Human → auto";
  return kind ?? "unknown";
}

export default async function BoundaryViolationsPage() {
  const headersList = await headers();
  const session = await getSession(headersList.get("x-session-id") ?? "");

  if (!session) throw new Error("unauthenticated");
  const workspaceId = session.workspaceId;

  const rows = await db
    .select({
      id: wikiReviewQueue.id,
      kind: wikiReviewQueue.kind,
      status: wikiReviewQueue.status,
      description: wikiReviewQueue.description,
      commitSha: wikiReviewQueue.commitSha,
      affectedPages: wikiReviewQueue.affectedPages,
      payload: wikiReviewQueue.payload,
      createdAt: wikiReviewQueue.createdAt,
    })
    .from(wikiReviewQueue)
    .where(
      and(
        eq(wikiReviewQueue.workspaceId, workspaceId),
        eq(wikiReviewQueue.kind, "boundary_violation"),
      ),
    )
    .orderBy(desc(wikiReviewQueue.createdAt))
    .limit(PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader

        eyebrow="Admin · Wiki Boundary"
        title="Wiki 경계 위반"
        description={`LLM이 wiki/manual/**을, 사람이 wiki/auto/**을 건드린 커밋 기록. 최근 ${PAGE_SIZE}건.`}
      />

      <DataTableShell
        rowCount={rows.length}
        empty={
          <EmptyState
            title="위반 없음"
            description="auto/manual 경계가 정상입니다."
          />
        }
      >
        <ul className="divide-y divide-surface-200">
          {rows.map((row) => {
            const payload = readPayload(row.payload);
            const kindLabel = violationLabel(payload.kind);
            const path = payload.path ?? "(unknown path)";
            const author = payload.author ?? "(unknown author)";
            const shortSha = (row.commitSha ?? payload.commitSha ?? "").slice(
              0,
              10,
            );

            return (
              <li
                key={row.id}
                className="flex items-start gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-surface-900">
                    <code>{path}</code>
                  </p>
                  <p className="mt-0.5 text-xs text-surface-500">
                    {author}
                    {shortSha ? ` · ${shortSha}` : ""}
                    {" · "}
                    {row.createdAt.toISOString()}
                  </p>
                  {row.description ? (
                    <p className="mt-1 text-xs text-surface-500">
                      {row.description}
                    </p>
                  ) : null}
                </div>
                <Badge variant="destructive" className="shrink-0">
                  {kindLabel}
                </Badge>
                <Badge variant="outline" className="shrink-0">
                  {row.status}
                </Badge>
              </li>
            );
          })}
        </ul>
      </DataTableShell>
    </div>
  );
}
