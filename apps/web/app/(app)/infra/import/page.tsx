import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { forbidden } from 'next/navigation';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { hasPermission } from '@jarvis/auth/rbac';
import { requirePageSession } from '@/lib/server/page-auth';
import { PageHeader } from '@/components/patterns/PageHeader';

export const dynamic = 'force-dynamic';

/**
 * Infra Import — status + workflow guide.
 *
 * Intentionally NOT a file-upload form: the actual SQL ingestion runs as an
 * admin CLI step (parse-companies-source.py → build-infra-prompts.py → executor
 * subagents) so 담당자 can see the audit log and re-run at will. This page
 * surfaces the CURRENT state of the pipeline (record count, last parsed
 * timestamp, generated page count) and documents the exact commands to
 * run — same information we'd expose in an admin wiki page.
 *
 * Access: `KNOWLEDGE_REVIEW` (admin-ish). If you can view infra pages but
 * cannot run the pipeline, you still get the status table, no command box.
 */
type PipelineStatus = {
  recordsExists: boolean;
  recordCount: number | null;
  recordsUpdatedAt: string | null;
  promptCount: number;
  generatedPageCount: number;
  companyFolderCount: number;
};

function readPipelineStatus(): PipelineStatus {
  const repoRoot = process.cwd();
  const recordsPath = path.join(repoRoot, 'data/infra/records.jsonl');
  const promptsDir = path.join(repoRoot, 'data/infra/synth_prompts');
  const wikiInfraDir = path.join(repoRoot, 'wiki/jarvis/auto/infra');

  let recordsExists = false;
  let recordCount: number | null = null;
  let recordsUpdatedAt: string | null = null;

  if (fs.existsSync(recordsPath)) {
    recordsExists = true;
    const stat = fs.statSync(recordsPath);
    recordsUpdatedAt = stat.mtime.toISOString();
    try {
      const content = fs.readFileSync(recordsPath, 'utf-8');
      recordCount = content.split('\n').filter((l) => l.trim().length > 0).length;
    } catch {
      recordCount = null;
    }
  }

  let promptCount = 0;
  if (fs.existsSync(promptsDir)) {
    promptCount = fs
      .readdirSync(promptsDir)
      .filter((f) => f.startsWith('infra_') && f.endsWith('.md')).length;
  }

  let generatedPageCount = 0;
  let companyFolderCount = 0;
  if (fs.existsSync(wikiInfraDir)) {
    const walk = (dir: string): number => {
      let n = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) n += walk(full);
        else if (entry.isFile() && entry.name.endsWith('.md')) n += 1;
      }
      return n;
    };
    generatedPageCount = walk(wikiInfraDir);
    companyFolderCount = fs
      .readdirSync(wikiInfraDir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
  }

  return {
    recordsExists,
    recordCount,
    recordsUpdatedAt,
    promptCount,
    generatedPageCount,
    companyFolderCount,
  };
}

export default async function InfraImportPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  if (!session.workspaceId) forbidden();

  const canRunPipeline = hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW);
  const status = readPipelineStatus();

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '(없음)';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="인프라 SQL 가져오기"
          description="companies-source SQL → records.jsonl → wiki/infra/**.md 파이프라인 상태"
        />
        <Link
          href="/infra"
          className="mt-2 inline-flex shrink-0 items-center rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-50"
        >
          ← 대시보드
        </Link>
      </div>

      <section className="rounded-lg border border-surface-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">파이프라인 현황</h2>
        <dl className="grid grid-cols-[200px_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-surface-500">파서 결과 (records.jsonl)</dt>
          <dd className="text-surface-800">
            {status.recordsExists
              ? `${status.recordCount ?? '?'}건 — 갱신 ${fmtDate(status.recordsUpdatedAt)}`
              : '생성되지 않음'}
          </dd>

          <dt className="text-surface-500">Synth prompt 팩</dt>
          <dd className="text-surface-800">{status.promptCount}개 배치</dd>

          <dt className="text-surface-500">생성된 wiki 페이지</dt>
          <dd className="text-surface-800">
            {status.generatedPageCount}개 ({status.companyFolderCount}개 회사 폴더)
          </dd>
        </dl>
      </section>

      {canRunPipeline && (
        <section className="rounded-lg border border-surface-200 bg-surface-50 p-6 space-y-4">
          <h2 className="text-lg font-semibold">재생성 절차 (담당자)</h2>
          <p className="text-sm text-surface-700">
            새 SQL 덤프가 있으면 <code className="bg-surface-200 px-1 rounded">companies-source.sql</code>{' '}
            을 repo 루트에 두고 아래 3 단계를 순서대로 실행하세요. 결과는 자동으로{' '}
            <code className="bg-surface-200 px-1 rounded">wiki/jarvis/auto/infra/</code> 아래에
            저장됩니다.
          </p>

          <ol className="space-y-4 text-sm">
            <li>
              <div className="font-medium text-surface-900">1. 파싱 (Python)</div>
              <pre className="mt-1 rounded bg-surface-900 text-surface-100 p-3 overflow-x-auto font-mono text-xs">
                py scripts/parse-companies-source.py --input companies-source.sql --output
                data/infra/records.jsonl
              </pre>
            </li>
            <li>
              <div className="font-medium text-surface-900">2. 프롬프트 팩 빌드</div>
              <pre className="mt-1 rounded bg-surface-900 text-surface-100 p-3 overflow-x-auto font-mono text-xs">
                py scripts/build-infra-prompts.py
              </pre>
            </li>
            <li>
              <div className="font-medium text-surface-900">
                3. Synth 실행 (Claude Code 서브에이전트)
              </div>
              <p className="mt-1 text-surface-700">
                Claude Code 세션에서 각 prompt (
                <code className="bg-surface-200 px-1 rounded">
                  data/infra/synth_prompts/infra_NN.md
                </code>
                ) 을 executor 서브에이전트로 실행. 병렬 6개 동시 실행 권장.
              </p>
            </li>
            <li>
              <div className="font-medium text-surface-900">4. Ingest (worker 자동)</div>
              <p className="mt-1 text-surface-700">
                wiki-fs watcher 가 변경을 감지하면 worker ingest job 이 자동으로 DB
                projection 을 갱신합니다. 수 분 내 대시보드에 반영됩니다.
              </p>
            </li>
          </ol>
        </section>
      )}

      {!canRunPipeline && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          재생성은 KNOWLEDGE_REVIEW 권한 보유자만 실행할 수 있습니다.
        </section>
      )}
    </div>
  );
}
