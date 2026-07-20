import { sql } from "drizzle-orm";
import { parseSearchQuery } from "./query-parser.js";
import type { EvidenceSearchHit, EvidenceSearchInput, ResourceType } from "./types.js";

interface SearchDb {
  execute(query: unknown): Promise<{ rows: unknown[] }>;
}

export interface SearchDeps {
  db: SearchDb;
}

interface SearchRow extends EvidenceSearchHit {
  sortDate?: string | null;
}

export function createEvidenceSearcher(deps: SearchDeps) {
  return {
    async searchEvidence(input: EvidenceSearchInput): Promise<EvidenceSearchHit[]> {
      const parsed = parseSearchQuery(input.query);
      if (!parsed) return [];

      const allowed = Array.from(new Set(input.types)).filter(isResourceType);
      if (allowed.length === 0) return [];

      const take = Math.min(Math.max(Math.trunc(input.limit), 1), 50);
      const page = Math.max(Math.trunc(input.page), 1);
      const offset = (page - 1) * take;
      const asOf = parseAsOf(input.asOf);
      const allowedTypes = sql.join(allowed.map((value) => sql`${value}`), sql`, `);

      const rows = await deps.db.execute(sql`
        with args as (
          select
            ${input.workspaceId}::uuid as workspace_id,
            ${parsed.tsQueryText}::text as ts_query_text,
            ${parsed.trigramText}::text as trigram_text,
            array[${allowedTypes}]::text[] as allowed_types,
            ${asOf}::timestamptz as as_of
        ),
        ranked as (
          select
            'wiki'::text as resource_type,
            w.id::text as id,
            w.title,
            w.snippet,
            greatest(
              ts_rank_cd(w.search_vector, websearch_to_tsquery('simple', unaccent(args.ts_query_text))),
              similarity(unaccent(w.title), unaccent(args.trigram_text)),
              similarity(unaccent(w.snippet), unaccent(args.trigram_text))
            )::float8 as score,
            w.slug,
            w.path,
            null::text as source_revision_id,
            null::text as locator,
            null::text as effective_from,
            null::text as canonical_url,
            null::text as sort_date
          from wiki_page_index w
          cross join args
          where 'wiki' = any(args.allowed_types)
            and w.workspace_id = args.workspace_id
            and w.zone in ('auto', 'manual')
            and w.published_status = 'published'
            and w.path not in ('auto/index.md', 'manual/index.md', 'auto/log.md', 'manual/log.md')
            and w.path not like 'auto/_system/%'
            and w.path not like 'manual/_system/%'
            and w.path not like 'auto/_archive/%'
            and w.path not like 'manual/_archive/%'
            and (
              w.search_vector @@ websearch_to_tsquery('simple', unaccent(args.ts_query_text))
              or similarity(unaccent(w.title), unaccent(args.trigram_text)) >= 0.2
              or similarity(unaccent(w.snippet), unaccent(args.trigram_text)) >= 0.2
            )

          union all

          select
            'source'::text as resource_type,
            d.id::text as id,
            d.title,
            d.title as snippet,
            greatest(
              ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', unaccent(args.ts_query_text))),
              similarity(unaccent(d.title), unaccent(args.trigram_text))
            )::float8 as score,
            null::text as slug,
            null::text as path,
            r.id::text as source_revision_id,
            null::text as locator,
            coalesce(r.effective_from::text, r.retrieved_at::text) as effective_from,
            d.canonical_url as canonical_url,
            coalesce(r.effective_from::text, r.retrieved_at::text) as sort_date
          from source_document d
          inner join source_revision r
            on r.source_document_id = d.id
          cross join args
          where 'source' = any(args.allowed_types)
            and d.workspace_id = args.workspace_id
            and r.workspace_id = args.workspace_id
            and r.parse_status = 'parsed'
            and (args.as_of is null or (
              coalesce(r.effective_from, r.retrieved_at) <= args.as_of
              and (r.effective_to is null or r.effective_to >= args.as_of)
            ))
            and (
              d.search_vector @@ websearch_to_tsquery('simple', unaccent(args.ts_query_text))
              or similarity(unaccent(d.title), unaccent(args.trigram_text)) >= 0.2
            )

          union all

          select
            'legal_case'::text as resource_type,
            c.id::text as id,
            c.case_number as title,
            left(c.holding_summary, 240) as snippet,
            greatest(
              ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', unaccent(args.ts_query_text))),
              similarity(unaccent(c.case_number), unaccent(args.trigram_text)),
              similarity(unaccent(c.holding_summary), unaccent(args.trigram_text))
            )::float8 as score,
            null::text as slug,
            null::text as path,
            c.source_revision_id::text as source_revision_id,
            'holding_summary'::text as locator,
            c.decision_date::text as effective_from,
            null::text as canonical_url,
            c.decision_date::text as sort_date
          from legal_case c
          cross join args
          where 'legal_case' = any(args.allowed_types)
            and c.workspace_id = args.workspace_id
            and (args.as_of is null or c.decision_date <= args.as_of::date)
            and (
              c.search_vector @@ websearch_to_tsquery('simple', unaccent(args.ts_query_text))
              or similarity(unaccent(c.case_number), unaccent(args.trigram_text)) >= 0.2
              or similarity(unaccent(c.holding_summary), unaccent(args.trigram_text)) >= 0.2
            )
        )
        select
          resource_type as "resourceType",
          id,
          title,
          snippet,
          score,
          slug,
          path,
          source_revision_id as "sourceRevisionId",
          locator,
          effective_from as "effectiveFrom",
          canonical_url as "canonicalUrl",
          sort_date as "sortDate"
        from ranked
        order by score desc, sort_date desc nulls last, resource_type asc, id asc
        limit ${take}
        offset ${offset}
      `);

      return (rows.rows as SearchRow[]).map(({ sortDate: _sortDate, ...row }) => row);
    },
  };
}

export async function searchEvidence(input: EvidenceSearchInput): Promise<EvidenceSearchHit[]> {
  const { db } = await import("@jarvis/db");
  return createEvidenceSearcher({ db }).searchEvidence(input);
}

function parseAsOf(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid asOf date");

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("invalid asOf date");
  }

  return parsed.toISOString();
}

function isResourceType(value: string): value is ResourceType {
  return value === "wiki" || value === "source" || value === "legal_case";
}
