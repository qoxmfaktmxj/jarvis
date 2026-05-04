// apps/worker/src/jobs/wiki-link-infra-system.ts
//
// Plan 5 — H3: wiki ingest 후 infra_system.wikiPageId 자동 link.
//
// 매칭 규칙:
//   wiki_page_index.frontmatter.infra.companyCd + infra.systemName 이
//   infra_system.companyId(via legacy_company_cd → company.code) +
//   infra_system.systemName 과 일치하면 wikiPageId 갱신.
//
// 호출 시점:
//   - manual: pg-boss 큐 `wiki-link-infra-system`에 send (workspaceId payload)
//   - 권장: ingest write-and-commit 잡이 완료된 직후 emit (별도 PR에서 hook 추가)
//
// 멱등: 같은 (companyId, systemName) 매칭이 유지되는 한 결과는 동일.
// 배치 트랜잭션 1회로 모든 매칭을 갱신.
//
// 권한: 워커 잡이므로 RBAC 우회. workspaceId 격리만 유지.

import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";

export const WIKI_LINK_INFRA_QUEUE = "wiki-link-infra-system";

export type WikiLinkInfraPayload = {
  workspaceId: string;
};

export type WikiLinkInfraResult = {
  matched: number;
  updated: number;
};

/**
 * 단일 workspace에서 frontmatter.infra 메타가 있는 wiki page를
 * infra_system row와 매칭해 wikiPageId를 갱신한다.
 *
 * - sub-query 한 번으로 매칭 + UPDATE.
 * - 이미 동일 wikiPageId인 row는 변경 없음 (멱등).
 */
export async function linkInfraSystemsToWikiPages(
  payload: WikiLinkInfraPayload,
): Promise<WikiLinkInfraResult> {
  const { workspaceId } = payload;

  // matched: frontmatter.infra.companyCd + systemName 으로 매칭되는 후보 수
  const matchedRows = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count
    FROM wiki_page_index wpi
    JOIN company c
      ON c.workspace_id = wpi.workspace_id
     AND c.code = (wpi.frontmatter -> 'infra' ->> 'companyCd')
    JOIN infra_system isys
      ON isys.workspace_id = wpi.workspace_id
     AND isys.company_id = c.id
     AND isys.system_name = (wpi.frontmatter -> 'infra' ->> 'systemName')
    WHERE wpi.workspace_id = ${workspaceId}
      AND wpi.frontmatter -> 'infra' ->> 'companyCd' IS NOT NULL
      AND wpi.frontmatter -> 'infra' ->> 'systemName' IS NOT NULL
  `);
  const matched = Number(matchedRows.rows[0]?.count ?? 0);

  // 갱신: wikiPageId가 NULL이거나 다른 page를 가리키는 경우만 set
  const updatedResult = await db.execute<{ id: string }>(sql`
    UPDATE infra_system isys
    SET wiki_page_id = wpi.id, updated_at = NOW()
    FROM wiki_page_index wpi
    JOIN company c
      ON c.workspace_id = wpi.workspace_id
     AND c.code = (wpi.frontmatter -> 'infra' ->> 'companyCd')
    WHERE isys.workspace_id = ${workspaceId}
      AND wpi.workspace_id = ${workspaceId}
      AND isys.company_id = c.id
      AND isys.system_name = (wpi.frontmatter -> 'infra' ->> 'systemName')
      AND (isys.wiki_page_id IS DISTINCT FROM wpi.id)
    RETURNING isys.id
  `);
  const updated = updatedResult.rows.length;

  return { matched, updated };
}

/**
 * pg-boss 잡 핸들러. apps/worker/src/index.ts에서:
 *
 *   await boss.createQueue(WIKI_LINK_INFRA_QUEUE);
 *   await boss.work(WIKI_LINK_INFRA_QUEUE, wikiLinkInfraSystemHandler);
 *
 * 으로 register하면 외부에서 `boss.send(WIKI_LINK_INFRA_QUEUE, { workspaceId })`로 invoke 가능.
 */
export async function wikiLinkInfraSystemHandler(
  jobs: { data: WikiLinkInfraPayload }[],
): Promise<void> {
  for (const job of jobs) {
    const { matched, updated } = await linkInfraSystemsToWikiPages(job.data);
    // structured log; logger 의존성을 늘리지 않기 위해 console 사용 (다른 핸들러 패턴 동일)
    console.log(
      `[wiki-link-infra] workspace=${job.data.workspaceId} matched=${matched} updated=${updated}`,
    );
  }
}
