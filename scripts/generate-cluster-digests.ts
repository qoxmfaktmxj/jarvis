// scripts/generate-cluster-digests.ts
// P2: TSVD999 클러스터별 사용법 지식 자동 생성.
//   각 case_cluster에서 대표 사례를 LLM으로 요약 → knowledge_page(surface='derived') 생성.
//   이미 digest_page_id가 있는 클러스터는 스킵(--force로 재생성 가능).
//
// Usage:
//   pnpm exec tsx scripts/generate-cluster-digests.ts \
//     --workspace-id <UUID> \
//     --allow-external-llm       # 외부 OpenAI 호출을 명시 승인 (dry-run이 아니면 필수)
//     [--include-raw-cases]      # 사례 원문(title/symptom/action)까지 LLM에 전송.
//                                # 기본: 집계 키워드(topSymptoms/topActions)만 전송.
//     [--limit 50]               # 한 번에 처리할 클러스터 수 (기본 20)
//     [--force]                  # 이미 생성된 페이지도 재생성
//     [--dry-run]                # DB 변경 없이 프롬프트만 출력 (외부 전송도 안 함)
//     [--min-cases 3]            # 최소 사례 수 (기본 3)

import 'dotenv/config';
import OpenAI from 'openai';
import { db } from '../packages/db/client';
import { caseCluster, precedentCase } from '../packages/db/schema/case';
import { knowledgePage, knowledgePageVersion } from '../packages/db/schema/knowledge';
import { createChatWithTokenFallback } from '../packages/ai/openai-compat';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';

interface CliArgs {
  workspaceId: string;
  limit: number;
  force: boolean;
  dryRun: boolean;
  minCases: number;
  allowExternalLlm: boolean;
  includeRawCases: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { limit: 20, force: false, dryRun: false, minCases: 3, allowExternalLlm: false, includeRawCases: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace-id') out.workspaceId = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--min-cases') out.minCases = Number(argv[++i]);
    else if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-external-llm') out.allowExternalLlm = true;
    else if (a === '--include-raw-cases') out.includeRawCases = true;
  }
  if (!out.workspaceId) {
    console.error('missing --workspace-id');
    process.exit(1);
  }
  return out as CliArgs;
}

// [P2] DATABASE_URL 없으면 로컬 기본 DB로 fallback → published page가 엉뚱한 DB에 기록되는 사고 방지
function assertEnv(opts: { requireOpenAI: boolean }) {
  if (!process.env['DATABASE_URL']) {
    console.error('ERROR: DATABASE_URL is required. Set it in .env or shell environment.');
    process.exit(1);
  }
  if (opts.requireOpenAI && !process.env['OPENAI_API_KEY']) {
    console.error('ERROR: OPENAI_API_KEY is required for non-dry-run runs.');
    process.exit(1);
  }
}

// 최소한의 PII redaction — requestCompany 등 명시 식별자 필드는 프롬프트에서 제거하고,
// 자유 텍스트(symptom/action)에 있는 email/phone 같은 패턴만 마스킹한다.
function redact(s: string | null): string {
  if (!s) return '(없음)';
  return s
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[EMAIL]')
    .replace(/\b01[016789]-?\d{3,4}-?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{3}-\d{4}-\d{4}\b/g, '[PHONE]');
}

const OPENAI_MODEL = process.env['DIGEST_MODEL'] ?? 'gpt-5.4-mini';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
  }
  return _openai;
}

const SYSTEM_PROMPT = `당신은 사내 IT/HR 지식 에디터입니다. 여러 과거 문의 사례(TSVD999 원본)를 읽고
"이런 상황에는 어떻게 하세요" 형식의 **사용법 가이드 페이지**를 한국어로 작성합니다.

규칙:
- 특정 사용자/회사 이름은 제거하고 일반화합니다.
- 구조: (1) 한 문장 요약 (2) 자주 발생하는 상황 2~4개 (3) 해결 절차 Step 1~N (4) 담당/연락 안내.
- 마크다운(MDX) 사용. 코드 블록이나 화면 경로는 그대로 유지.
- 추측 금지. 사례에 없는 정보는 쓰지 마세요.
- 분량 300~600자.`;

interface SummarizeArgs {
  label: string;
  description: string | null;
  topSymptoms: string[];
  topActions: string[];
  cases: Array<{ title: string; symptom: string | null; action: string | null; result: string | null }>;
  caseCount: number;
  resolvedStats: { resolved: number; workaround: number; other: number };
  includeRawCases: boolean; // false면 원문 없이 집계만 전송
}

function buildPrompt(args: SummarizeArgs): string {
  const stats = args.resolvedStats;
  const statsLine = `해결=${stats.resolved}, 우회=${stats.workaround}, 기타=${stats.other}`;

  let caseSection: string;
  if (args.includeRawCases) {
    const caseLines = args.cases
      .map((c, i) => `
### 사례 ${i + 1}: ${redact(c.title)}
- 증상: ${redact(c.symptom)}
- 조치: ${redact(c.action)}
- 결과: ${c.result ?? 'unknown'}`)
      .join('\n');
    caseSection = `아래 ${args.cases.length}개 사례(원문 발췌)를 기반으로 가이드를 작성하세요.
${caseLines}`;
  } else {
    // 기본: 집계 키워드와 통계만. 사례 원문은 프롬프트에 절대 포함 안 함.
    caseSection = `총 ${args.caseCount}건의 비슷한 사례가 누적되었습니다 (${statsLine}).
원문은 개인정보 보호를 위해 전송하지 않습니다. 위의 "주요 증상/조치 키워드"만 보고 일반적인 가이드를 작성하세요.`;
  }

  return `클러스터 라벨: ${args.label}
클러스터 설명: ${args.description ?? '(없음)'}
주요 증상 키워드: ${args.topSymptoms.slice(0, 10).join(', ')}
주요 조치 키워드: ${args.topActions.slice(0, 10).join(', ')}

${caseSection}

출력 형식(JSON):
{"title": "...", "summary": "...", "mdx": "..."}`;
}

async function summarizeCluster(args: SummarizeArgs): Promise<{ title: string; mdx: string; summary: string }> {
  const userPrompt = buildPrompt(args);

  const res = await createChatWithTokenFallback<
    OpenAI.Chat.Completions.ChatCompletion,
    Record<string, unknown>
  >(
    getOpenAI(),
    OPENAI_MODEL,
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    },
    1500,
  );

  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as { title?: string; summary?: string; mdx?: string };
  if (!parsed.title || !parsed.mdx) {
    throw new Error('LLM response missing title/mdx');
  }
  return {
    title: parsed.title,
    summary: parsed.summary ?? '',
    mdx: parsed.mdx,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 120);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertEnv({ requireOpenAI: !args.dryRun });

  if (!args.dryRun && !args.allowExternalLlm) {
    console.error('ERROR: This script sends internal case text to OpenAI.');
    console.error('       Pass --allow-external-llm to acknowledge, or --dry-run to preview.');
    process.exit(1);
  }

  console.log('[digest] workspace=%s limit=%d force=%s dryRun=%s minCases=%d externalLLM=%s',
    args.workspaceId, args.limit, args.force, args.dryRun, args.minCases, args.allowExternalLlm);

  const clusters = await db
    .select()
    .from(caseCluster)
    .where(
      and(
        eq(caseCluster.workspaceId, args.workspaceId),
        gte(caseCluster.caseCount, args.minCases),
        args.force ? sql`1=1` : isNull(caseCluster.digestPageId),
      ),
    )
    .orderBy(desc(caseCluster.caseCount))
    .limit(args.limit);

  console.log(`[digest] target clusters: ${clusters.length}`);

  let created = 0;
  let failed = 0;

  for (const c of clusters) {
    try {
      // [P0] 클러스터에 RESTRICTED/SECRET_REF_ONLY 사례가 하나라도 있으면 skip.
      //      외부 LLM(OpenAI)에 민감 데이터가 전송되는 걸 차단.
      const [sensCheck] = await db
        .select({
          restricted: sql<number>`SUM(CASE WHEN ${precedentCase.sensitivity} IN ('RESTRICTED','SECRET_REF_ONLY') THEN 1 ELSE 0 END)`,
          total: sql<number>`COUNT(*)`,
        })
        .from(precedentCase)
        .where(
          and(
            eq(precedentCase.workspaceId, args.workspaceId),
            eq(precedentCase.clusterId, c.numericClusterId),
          ),
        );

      if (Number(sensCheck?.restricted ?? 0) > 0) {
        console.log(`[digest] skip cluster ${c.numericClusterId} (contains restricted cases; total=${sensCheck?.total})`);
        continue;
      }

      // 사례 조회: min-cases보다 작으면 limit이 부족해 skip되므로 넉넉히 가져옴
      const fetchLimit = Math.max(args.minCases, 5);
      const cases = await db
        .select({
          title: precedentCase.title,
          symptom: precedentCase.symptom,
          action: precedentCase.action,
          result: precedentCase.result,
        })
        .from(precedentCase)
        .where(
          and(
            eq(precedentCase.workspaceId, args.workspaceId),
            eq(precedentCase.clusterId, c.numericClusterId),
            // 한 번 더 방어: PUBLIC/INTERNAL만 외부 전송
            sql`${precedentCase.sensitivity} NOT IN ('RESTRICTED','SECRET_REF_ONLY')`,
          ),
        )
        .orderBy(desc(precedentCase.isDigest))
        .limit(fetchLimit);

      if (cases.length < args.minCases) {
        console.log(`[digest] skip cluster ${c.numericClusterId} (not enough cases: ${cases.length} < ${args.minCases})`);
        continue;
      }

      const resolvedStats = cases.reduce(
        (acc, cur) => {
          if (cur.result === 'resolved') acc.resolved++;
          else if (cur.result === 'workaround') acc.workaround++;
          else acc.other++;
          return acc;
        },
        { resolved: 0, workaround: 0, other: 0 },
      );

      const summarizeArgs: SummarizeArgs = {
        label: c.label,
        description: c.description,
        topSymptoms: c.topSymptoms ?? [],
        topActions: c.topActions ?? [],
        cases: cases.slice(0, 5),
        caseCount: cases.length,
        resolvedStats,
        includeRawCases: args.includeRawCases,
      };

      // [P1] dry-run은 외부 전송 금지. 프롬프트만 출력하고 다음 클러스터로.
      if (args.dryRun) {
        console.log(`--- cluster ${c.numericClusterId} (dry-run prompt) ---`);
        console.log(buildPrompt(summarizeArgs).slice(0, 800));
        continue;
      }

      // LLM 호출은 트랜잭션 밖에서 (네트워크 오래 걸림)
      const result = await summarizeCluster(summarizeArgs);

      // [P2] page upsert + version insert + cluster update를 한 트랜잭션으로 묶음
      const slug = `cluster-${c.numericClusterId}-${slugify(result.title)}`;
      const pageId = await db.transaction(async (tx) => {
        const [page] = await tx
          .insert(knowledgePage)
          .values({
            workspaceId: args.workspaceId,
            pageType: 'article',
            title: result.title,
            slug,
            summary: result.summary,
            sensitivity: 'INTERNAL',
            publishStatus: 'published',
            sourceType: 'derived-cluster',
            sourceKey: `cluster:${c.numericClusterId}`,
            surface: 'derived',
            authority: 'derived',
            domain: 'hr',
          })
          .onConflictDoUpdate({
            target: [knowledgePage.workspaceId, knowledgePage.sourceType, knowledgePage.sourceKey],
            targetWhere: sql`source_type IS NOT NULL`,
            set: {
              title: result.title,
              summary: result.summary,
              updatedAt: new Date(),
            },
          })
          .returning({ id: knowledgePage.id });

        const [latest] = await tx
          .select({ v: sql<number>`COALESCE(MAX(${knowledgePageVersion.versionNumber}), 0)` })
          .from(knowledgePageVersion)
          .where(eq(knowledgePageVersion.pageId, page.id));
        const nextVersion = Number(latest?.v ?? 0) + 1;

        await tx.insert(knowledgePageVersion).values({
          pageId: page.id,
          versionNumber: nextVersion,
          title: result.title,
          mdxContent: result.mdx,
          changeNote: `auto-generated from cluster ${c.numericClusterId}`,
        });

        await tx
          .update(caseCluster)
          .set({ digestPageId: page.id, updatedAt: new Date() })
          .where(eq(caseCluster.id, c.id));

        return page.id;
      });

      created++;
      console.log(`[digest] ✓ cluster ${c.numericClusterId}: ${result.title} (page=${pageId})`);
    } catch (err) {
      failed++;
      console.error(`[digest] ✗ cluster ${c.numericClusterId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[digest] done. created=${created} failed=${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
