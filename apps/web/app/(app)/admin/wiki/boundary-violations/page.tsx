/**
 * apps/web/app/(app)/admin/wiki/boundary-violations/page.tsx
 *
 * Phase-W3 v4-W3-T1 — admin dashboard for wiki auto/manual boundary
 * violations. RSC; reads `wiki_review_queue` rows with
 * `kind='boundary_violation'` scoped to the current workspace.
 *
 * Mirrors the existing admin/review-queue page layout (headers → session →
 * drizzle query → list rendering) so we stay aligned on structure even
 * though this page is narrower in scope (read-only; approvals happen in
 * the main review-queue UI).
 */

import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@jarvis/db/client";
import { wikiReviewQueue } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";

import { Badge } from "@/components/ui/badge";

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Wiki 경계 위반
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          LLM이 `wiki/manual/**`을, 사람이 `wiki/auto/**`을 건드린 커밋을
          기록합니다. 최근 {PAGE_SIZE}건.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          위반 없음 — auto/manual 경계가 정상입니다.
        </div>
      ) : (
        <div className="border rounded-md divide-y">
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
              <div
                key={row.id}
                className="flex items-start gap-4 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <code>{path}</code>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {author}
                    {shortSha ? ` · ${shortSha}` : ""}
                    {" · "}
                    {row.createdAt.toISOString()}
                  </p>
                  {row.description ? (
                    <p className="text-xs text-muted-foreground mt-1">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
