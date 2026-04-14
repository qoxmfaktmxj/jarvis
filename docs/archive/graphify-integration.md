# Graphify Integration Plan for Jarvis

> **Status**: Draft
> **Created**: 2026-04-09
> **Last Updated**: 2026-04-09
> **Author**: @qoxmfaktmxj
> **Source Repo**: `C:\Users\Administrator\Desktop\devdev\graphify`

---

## 1. Executive Summary

Jarvis는 현재 **텍스트 기반 RAG**(vector + FTS hybrid search → Claude 답변)에 강하지만,
코드/문서/이미지 간의 **구조적 관계를 탐색**하는 능력이 없다.

Graphify는 코드 AST + LLM semantic extraction으로 **knowledge graph**를 빌드하고,
community detection, god node 분석, path traversal, wiki 자동 생성까지 지원한다.

이 계획은 Graphify의 산출물과 쿼리 엔진을 Jarvis에 3단계로 통합하여,
**"무엇이 적혀있는가"(텍스트 검색) + "어떻게 연결되어 있는가"(구조 탐색)**를 동시에 답할 수 있는 시스템을 만드는 것이다.

---

## 2. 현재 상태 분석

### 2.1 Jarvis — 보유 역량

| 계층 | 기능 | 핵심 파일 |
|------|------|-----------|
| 업로드 | MinIO presign → raw_source 레코드 → ingest job enqueue | `apps/web/app/api/upload/route.ts` |
| 인제스트 | PDF/DOCX/text/JSON/ZIP 텍스트 추출 → parsedContent 저장 | `apps/worker/src/index.ts` (ingest handler) |
| 임베딩 | text-embedding-3-small, 1536d, 300단어 chunk, IVFFLAT 인덱스 | `packages/ai/embed.ts`, embed handler |
| 검색 | FTS(tsvector) + trigram + vector hybrid, 가중치 0.6/0.3/0.1 | `packages/search/pg-search.ts` |
| Ask AI | 벡터+FTS hybrid top-5 retrieval → Claude sonnet-4-5 SSE 스트리밍 | `packages/ai/ask.ts` |
| 권한 | SECRET_REF_ONLY 필터, role-based access | `packages/search/pg-search.ts:L150+` |

### 2.2 Jarvis — 현재 부재

| 부재 항목 | 영향 |
|-----------|------|
| 코드 파일 구조 분석 (AST, call graph, import graph) | 코드 리포 업로드해도 텍스트 grep만 가능 |
| 문서/코드 간 관계 그래프 | "이 함수가 왜 이 설계 문서와 연결되는가?" 답변 불가 |
| 이미지/다이어그램 semantic extraction | 이미지는 `[Binary file: type]` placeholder |
| 구조 기반 네비게이션 (god nodes, community map, path) | 아키텍처 전체상 파악 불가 |
| ResourceType 확장 | `'knowledge'`만 존재, `'code'`/`'graph'` 미구현 |

### 2.3 Graphify — 활용 가능 역량

| 모듈 | 기능 | Jarvis 활용 가능성 |
|------|------|-------------------|
| `detect.py` | 파일 분류, .graphifyignore, 민감파일 제외, corpus health check | 업로드 전처리 |
| `extract.py` | 19언어 AST + Claude semantic extraction (docs/papers/images) | 핵심 - 구조 추출 |
| `build.py` | extraction → NetworkX graph, 3계층 중복제거 | 그래프 조립 |
| `cluster.py` | Leiden community detection, oversized community 분할 | 구조 그룹핑 |
| `analyze.py` | god nodes, surprising connections, knowledge gaps, suggested questions | 분석 인사이트 |
| `report.py` | GRAPH_REPORT.md 생성 (사람 읽기용 구조 감사) | **MVP 핵심** |
| `wiki.py` | community별/god node별 wiki 문서 자동생성 | **MVP 핵심** |
| `export.py` | graph.html (vis.js interactive), graph.json, SVG, GraphML | UI 시각화 |
| `serve.py` | MCP server (query, get_node, get_neighbors, shortest_path 등 7개 tool) | graph-native retrieval |
| `cache.py` | SHA256 기반 파일별 extraction 캐시 | 증분 빌드 |
| `validate.py` | extraction schema 검증 | 데이터 품질 보장 |
| `security.py` | URL validation, SSRF 차단, path traversal 방지 | ingest 보안 강화 |

---

## 3. 통합 아키텍처

### 3.1 전체 흐름도

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            USER UPLOAD                                  │
│   (repo zip / code files / docs / PDFs / images / URLs)                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MinIO Storage                                   │
│   jarvis-files bucket: raw files stored by objectKey                   │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌──────────────────────┐      ┌──────────────────────────────────────────┐
│   EXISTING PIPELINE  │      │         NEW: GRAPHIFY PIPELINE           │
│                      │      │                                          │
│ ingest job           │      │  graphify-build job                      │
│  → text extraction   │      │   → unzip/prepare sandbox               │
│  → parsedContent     │      │   → Python subprocess:                  │
│                      │      │     detect → extract → build →          │
│ compile job          │      │     cluster → analyze → report → export │
│  → mdx → summary    │      │   → store graph.json to MinIO           │
│                      │      │   → store graph.html to MinIO           │
│ embed job            │      │   → GRAPH_REPORT.md → knowledge_page    │
│  → chunk → embed     │      │   → wiki/*.md → knowledge_pages         │
│  → knowledge_claim   │      │   → graph nodes/edges → DB tables       │
│                      │      │                                          │
└──────────┬───────────┘      └──────────────┬───────────────────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                                       │
│                                                                         │
│  knowledge_page ──── knowledge_claim ──── search_vector                │
│       ▲                    ▲                                            │
│       │                    │                                            │
│  graph_snapshot ── graph_node ── graph_edge ── graph_community          │
│                                                                         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌──────────────────────┐      ┌──────────────────────────────────────────┐
│   EXISTING SEARCH    │      │        NEW: GRAPH RETRIEVAL              │
│                      │      │                                          │
│ FTS + trgm + vector  │      │  retrieveRelevantGraphContext()          │
│ hybrid ranking       │      │   → keyword → graph nodes               │
│ 0.6 / 0.3 / 0.1     │      │   → BFS/DFS neighbors                   │
│                      │      │   → community context                   │
│ ASK AI               │      │   → god node connections                │
│ Claude sonnet-4-5    │      │   → inject into Ask AI context          │
│ [source:N] citations │      │                                          │
└──────────────────────┘      └──────────────────────────────────────────┘
```

### 3.2 핵심 설계 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| Graphify 실행 방식 | Python subprocess (worker에서) | Jarvis는 Node.js, Graphify는 Python; MCP server는 2단계에서 별도 상주 |
| 산출물 저장 | graph.json/html → MinIO, 분석 문서 → knowledge_page | MinIO는 파일 스토어 역할, DB는 검색 가능 콘텐츠 역할 분리 |
| Graph DB | PostgreSQL 테이블 (graph_node, graph_edge 등) | Neo4j 추가 의존성 불필요, PG로 BFS/DFS CTE 쿼리 가능 |
| 임베딩 | Graphify는 안 씀 (topology 기반), Jarvis 벡터는 그대로 유지 | 상호보완 — 구조로 좁히고 의미로 정렬 |
| 권한 | graph_snapshot에 workspaceId 바인딩, graph_node에 sensitivity 상속 | 기존 ACL 체계 재사용 |

---

## 4. 단계별 구현 계획

---

### Phase 1: MVP — Graphify 산출물을 Knowledge로 Import (2주)

**목표**: Graphify를 실행하고 결과 문서를 기존 knowledge pipeline에 태워서,
Ask AI와 Search에서 구조 관련 질문에 답할 수 있게 만든다.

#### 1.1 Python 환경 준비

**작업**:
- worker 서버에 Python 3.10+ 설치 확인/설정
- `pip install graphifyy` 설치 스크립트 작성
- Docker 환경이면 worker Dockerfile에 Python 레이어 추가

**파일 변경**:
```
apps/worker/Dockerfile          # Python 3.10 + graphifyy 설치 추가
apps/worker/scripts/setup.sh    # (신규) Python 환경 셋업 스크립트
```

**상세**:
```dockerfile
# apps/worker/Dockerfile 추가 레이어
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv
RUN python3 -m venv /opt/graphify-venv
RUN /opt/graphify-venv/bin/pip install graphifyy
ENV GRAPHIFY_BIN=/opt/graphify-venv/bin/graphify
```

#### 1.2 graphify-build Job Handler 구현

**작업**:
- `apps/worker/src/handlers/graphify-build.ts` 신규 작성
- pg-boss job 등록: `boss.work('graphify-build', { batchSize: 1 }, graphifyBuildHandler)`
- 1 concurrent만 허용 (CPU/메모리 집약적)

**Job Payload**:
```typescript
interface GraphifyBuildPayload {
  rawSourceId: string;       // zip/repo 업로드의 raw_source ID
  workspaceId: string;
  requestedBy: string;       // userId
  mode?: 'standard' | 'deep';  // --mode deep 옵션
  targetPath?: string;       // 특정 디렉토리만 대상
}
```

**Handler 흐름**:
```
1. MinIO에서 파일 다운로드 (raw_source.storagePath)
2. 임시 디렉토리에 압축 해제 (zip이면 unzip, tar면 tar -xf)
3. .graphifyignore 파일 생성 (node_modules, .git, dist, build, vendor 기본 제외)
4. Python subprocess 실행:
   graphify <temp_dir> --no-viz --wiki --update
5. 결과 파일 수집:
   - graphify-out/GRAPH_REPORT.md
   - graphify-out/wiki/*.md
   - graphify-out/graph.json
   - graphify-out/graph.html
6. graph.json, graph.html → MinIO에 업로드
   - key: `graphify/${workspaceId}/${snapshotId}/graph.json`
   - key: `graphify/${workspaceId}/${snapshotId}/graph.html`
7. GRAPH_REPORT.md → knowledge_page로 import (pageType: 'analysis')
8. wiki/*.md 각각 → knowledge_page로 import (pageType: 'analysis')
9. 각 knowledge_page에 대해 compile + embed job enqueue
10. graph_snapshot 레코드 생성 (메타데이터)
11. 임시 디렉토리 정리
```

**파일 변경**:
```
apps/worker/src/handlers/graphify-build.ts   # (신규) 핵심 handler
apps/worker/src/index.ts                     # job 등록 추가
```

**구현 코드 뼈대** (`graphify-build.ts`):
```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { db } from '@jarvis/db';
import { rawSource, knowledgePage, knowledgePageVersion } from '@jarvis/db/schema';
import { minioClient, BUCKET_NAME } from '../minio';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const execFileAsync = promisify(execFile);
const GRAPHIFY_BIN = process.env.GRAPHIFY_BIN || 'graphify';
const GRAPHIFY_TIMEOUT_MS = 10 * 60 * 1000; // 10분 타임아웃

interface GraphifyBuildPayload {
  rawSourceId: string;
  workspaceId: string;
  requestedBy: string;
  mode?: 'standard' | 'deep';
}

export async function graphifyBuildHandler(job: { data: GraphifyBuildPayload }) {
  const { rawSourceId, workspaceId, requestedBy, mode } = job.data;

  // 1. raw_source에서 storagePath 조회
  const source = await db.query.rawSource.findFirst({
    where: eq(rawSource.id, rawSourceId),
  });
  if (!source?.storagePath) throw new Error(`raw_source ${rawSourceId} not found or no storagePath`);

  // 2. 임시 디렉토리 생성 + 파일 다운로드 + 압축 해제
  const tempDir = await mkdtemp(join(tmpdir(), 'graphify-'));
  const downloadPath = join(tempDir, source.originalFilename || 'archive');

  try {
    await minioClient.fGetObject(BUCKET_NAME, source.storagePath, downloadPath);
    await unarchive(downloadPath, tempDir); // zip/tar 처리

    // 3. .graphifyignore 생성
    const ignoreContent = 'node_modules/\n.git/\ndist/\nbuild/\nvendor/\n*.min.js\n*.min.css\n';
    await writeFile(join(tempDir, '.graphifyignore'), ignoreContent);

    // 4. Graphify 실행
    const args = [tempDir, '--no-viz', '--wiki'];
    if (mode === 'deep') args.push('--mode', 'deep');

    const { stdout, stderr } = await execFileAsync(GRAPHIFY_BIN, args, {
      timeout: GRAPHIFY_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    // 5. 결과물 경로
    const outDir = join(tempDir, 'graphify-out');
    const snapshotId = randomUUID();

    // 6. graph.json, graph.html → MinIO
    await uploadToMinio(outDir, 'graph.json', `graphify/${workspaceId}/${snapshotId}/graph.json`);
    // graph.html는 --no-viz라 생성 안 됨; 필요시 별도 실행

    // 7. GRAPH_REPORT.md → knowledge_page
    const reportContent = await readFile(join(outDir, 'GRAPH_REPORT.md'), 'utf-8');
    await importAsKnowledgePage({
      workspaceId,
      title: `[Graph] Architecture Report — ${source.originalFilename}`,
      slug: `graph-report-${snapshotId.slice(0, 8)}`,
      mdxContent: reportContent,
      pageType: 'analysis',
      sensitivity: 'INTERNAL',
      createdBy: requestedBy,
    });

    // 8. wiki/*.md → knowledge_pages
    const wikiDir = join(outDir, 'wiki');
    const wikiFiles = await readdir(wikiDir).catch(() => []);
    for (const wikiFile of wikiFiles) {
      if (!wikiFile.endsWith('.md')) continue;
      const content = await readFile(join(wikiDir, wikiFile), 'utf-8');
      const title = wikiFile.replace('.md', '').replace(/_/g, ' ');
      await importAsKnowledgePage({
        workspaceId,
        title: `[Graph] ${title}`,
        slug: `graph-wiki-${snapshotId.slice(0, 8)}-${slugify(title)}`,
        mdxContent: content,
        pageType: 'analysis',
        sensitivity: 'INTERNAL',
        createdBy: requestedBy,
      });
    }

    // 9. graph_snapshot 메타데이터 저장 (Phase 2에서 확장)
    // 10. compile + embed는 importAsKnowledgePage 내부에서 enqueue

  } finally {
    // 11. 임시 디렉토리 정리
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

#### 1.3 Knowledge Import 헬퍼 함수

**작업**:
- `apps/worker/src/helpers/import-knowledge.ts` 신규 작성
- knowledge_page + knowledge_page_version을 트랜잭션으로 insert
- compile + embed job을 자동 enqueue

**핵심 로직**:
```typescript
async function importAsKnowledgePage(params: {
  workspaceId: string;
  title: string;
  slug: string;
  mdxContent: string;
  pageType: string;
  sensitivity: string;
  createdBy: string;
}): Promise<string> {
  const pageId = randomUUID();
  const versionId = randomUUID();

  await db.transaction(async (tx) => {
    // 1. knowledge_page insert
    await tx.insert(knowledgePage).values({
      id: pageId,
      workspaceId: params.workspaceId,
      pageType: params.pageType,
      title: params.title,
      slug: params.slug,
      sensitivity: params.sensitivity,
      publishStatus: 'published', // graph 결과는 바로 게시
      createdBy: params.createdBy,
    });

    // 2. knowledge_page_version insert
    await tx.insert(knowledgePageVersion).values({
      id: versionId,
      pageId,
      versionNumber: 1,
      mdxContent: params.mdxContent,
      changeNote: 'Auto-imported from Graphify analysis',
    });
  });

  // 3. compile + embed job enqueue
  await boss.send('compile', { pageId, versionId });
  // embed는 compile 완료 후 자동 trigger되므로 별도 enqueue 불필요
  // (기존 compile handler가 완료 시 embed를 enqueue하는지 확인 필요)

  return pageId;
}
```

**확인 필요 사항**:
- 현재 compile handler가 완료 시 embed job을 자동 enqueue하는지 확인
- 만약 안 한다면 `importAsKnowledgePage`에서 compile 완료 콜백으로 embed enqueue 추가

#### 1.4 Upload API 확장

**작업**:
- 기존 upload route에서 zip/tar 파일일 때 graphify-build job도 함께 enqueue
- 또는 별도 API endpoint: `POST /api/graphify/build`

**옵션 A — 기존 upload route 확장** (추천):
```typescript
// apps/web/app/api/upload/route.ts 수정
// ingest job enqueue 후, mime type이 zip/tar이면 graphify-build도 enqueue

if (isArchiveType(mimeType)) {
  await boss.send('graphify-build', {
    rawSourceId,
    workspaceId: session.workspaceId,
    requestedBy: session.userId,
  });
}
```

**옵션 B — 별도 API** (유연성 높음):
```typescript
// apps/web/app/api/graphify/build/route.ts (신규)
// POST body: { rawSourceId, mode?: 'standard' | 'deep' }
// 이미 업로드된 raw_source에 대해 수동으로 graphify-build 트리거
```

**추천**: 둘 다 구현. 옵션 A는 zip 업로드 시 자동, 옵션 B는 수동 트리거.

#### 1.5 graph_snapshot 테이블 (최소 버전)

**작업**:
- `packages/db/schema/graph.ts` 신규 작성
- Phase 1에서는 메타데이터만 저장 (graph.json 위치, 빌드 통계)

**스키마**:
```typescript
// packages/db/schema/graph.ts

import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const graphSnapshot = pgTable('graph_snapshot', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id),
  rawSourceId: uuid('raw_source_id').references(() => rawSource.id),
  title: varchar('title', { length: 500 }).notNull(),

  // 저장 경로
  graphJsonPath: varchar('graph_json_path', { length: 1000 }),  // MinIO key
  graphHtmlPath: varchar('graph_html_path', { length: 1000 }),  // MinIO key

  // 빌드 통계
  nodeCount: integer('node_count'),
  edgeCount: integer('edge_count'),
  communityCount: integer('community_count'),
  fileCount: integer('file_count'),

  // 빌드 메타데이터
  buildMode: varchar('build_mode', { length: 20 }).default('standard'), // standard | deep
  buildStatus: varchar('build_status', { length: 20 }).default('pending'),
    // pending | building | completed | failed
  buildDurationMs: integer('build_duration_ms'),
  buildError: varchar('build_error', { length: 2000 }),

  // 그래프 분석 요약 (analyze.py 결과의 핵심만)
  analysisMetadata: jsonb('analysis_metadata').default({}),
    // { godNodes: string[], communityLabels: string[], tokenReduction: number }

  createdBy: uuid('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**마이그레이션**:
```sql
CREATE TABLE graph_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  raw_source_id UUID REFERENCES raw_source(id),
  title VARCHAR(500) NOT NULL,
  graph_json_path VARCHAR(1000),
  graph_html_path VARCHAR(1000),
  node_count INTEGER,
  edge_count INTEGER,
  community_count INTEGER,
  file_count INTEGER,
  build_mode VARCHAR(20) DEFAULT 'standard',
  build_status VARCHAR(20) DEFAULT 'pending',
  build_duration_ms INTEGER,
  build_error VARCHAR(2000),
  analysis_metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_graph_snapshot_workspace ON graph_snapshot(workspace_id);
CREATE INDEX idx_graph_snapshot_status ON graph_snapshot(build_status);
```

#### 1.6 Phase 1 결과물 체크리스트

- [ ] Python 3.10+ 환경 준비 (Docker 또는 로컬)
- [ ] `pip install graphifyy` 자동화
- [ ] `graphify-build` pg-boss job handler 구현
- [ ] 임시 디렉토리 생성/압축해제/정리 로직
- [ ] .graphifyignore 기본값 생성
- [ ] Python subprocess 실행 + 타임아웃 + 에러 핸들링
- [ ] graph.json → MinIO 업로드
- [ ] GRAPH_REPORT.md → knowledge_page import
- [ ] wiki/*.md → knowledge_page bulk import
- [ ] graph_snapshot 테이블 생성 + 마이그레이션
- [ ] Upload API에서 zip/tar 시 graphify-build 자동 enqueue
- [ ] `POST /api/graphify/build` 수동 트리거 엔드포인트
- [ ] 에러 시 graph_snapshot.buildStatus = 'failed' + buildError 기록
- [ ] 기존 compile → embed 파이프라인과의 연동 확인
- [ ] E2E 테스트: zip 업로드 → graphify 빌드 → search에서 구조 질문 가능

---

### Phase 2: Architecture Viewer UI + graph.json 활용 (3주)

**목표**: graph.json을 기반으로 시각적 아키텍처 탐색 UI를 제공하고,
graph.html의 인터랙티브 뷰어를 Jarvis 내에 통합한다.

#### 2.1 Architecture Viewer 페이지

**라우트**: `/workspace/[workspaceId]/architecture`

**컴포넌트 구조**:
```
apps/web/app/(workspace)/workspace/[workspaceId]/architecture/
├── page.tsx                    # 메인 페이지
├── components/
│   ├── GraphViewer.tsx         # vis.js 또는 @sigma/react 기반 인터랙티브 그래프
│   ├── GraphSidebar.tsx        # 선택 노드 상세 정보 패널
│   ├── SnapshotSelector.tsx    # graph_snapshot 목록, 선택
│   ├── GodNodesCard.tsx        # god nodes 카드 리스트
│   ├── CommunitiesPanel.tsx    # community 목록 + 필터
│   ├── SurprisingCard.tsx      # surprising connections 카드
│   └── SuggestedQuestions.tsx  # graph가 제안하는 질문 → Ask AI 연동
└── hooks/
    ├── useGraphData.ts         # graph.json fetch + parsing
    └── useGraphNavigation.ts   # 노드 클릭/검색/필터 상태 관리
```

**UI 와이어프레임**:
```
┌──────────────────────────────────────────────────────────────┐
│  [Snapshot: project-api v3 ▾]   [Search nodes...]   [Filter] │
├──────────────────────────────┬───────────────────────────────┤
│                              │  Node: BaseClient             │
│                              │  Type: code (class)           │
│     Interactive Graph        │  File: client.py:42           │
│     (vis.js / sigma)         │  Community: 3 (HTTP Layer)    │
│                              │  Connections: 12              │
│     click node → sidebar     │  ─────────────────────        │
│     search → highlight       │  calls → RequestBuilder       │
│     community → color        │  calls → ConnectionPool       │
│                              │  method → send()              │
│                              │  method → close()             │
├──────────────────────────────┴───────────────────────────────┤
│  God Nodes           │  Surprising        │  Suggested Qs    │
│  ● BaseClient (12)   │  Auth ↔ Cache      │  "How does..."   │
│  ● Router (9)        │  Parser ↔ Logger   │  "Why is..."     │
│  ● Config (8)        │  DB ↔ Middleware   │  "What connects" │
└──────────────────────┴────────────────────┴──────────────────┘
```

#### 2.2 Graph Viewer API

**엔드포인트**:
```
GET  /api/graphify/snapshots                    # 워크스페이스별 snapshot 목록
GET  /api/graphify/snapshots/[id]               # snapshot 상세 (메타 + 분석)
GET  /api/graphify/snapshots/[id]/graph.json    # MinIO presign → redirect
GET  /api/graphify/snapshots/[id]/graph.html    # MinIO presign → redirect (iframe 임베드용)
POST /api/graphify/build                        # 수동 빌드 트리거 (Phase 1에서 구현)
```

**파일 변경**:
```
apps/web/app/api/graphify/snapshots/route.ts              # (신규) 목록
apps/web/app/api/graphify/snapshots/[id]/route.ts         # (신규) 상세
apps/web/app/api/graphify/snapshots/[id]/graph/route.ts   # (신규) presign redirect
```

#### 2.3 Graph Viewer 라이브러리 선택

| 옵션 | 장점 | 단점 | 추천 |
|------|------|------|------|
| **vis-network** (graph.html 재사용) | Graphify가 이미 생성, iframe으로 즉시 사용 | 커스터마이즈 제한, 5000+ nodes 성능 | Phase 2 초기 MVP |
| **@sigma/react** + graphology | React native, 대규모 그래프 렌더링 우수 | 별도 구현 필요 | Phase 2 고도화 |
| **react-force-graph** (3D) | 시각적 임팩트 | 무겁고, 복잡한 그래프에 과함 | 비추 |

**추천 전략**:
1. Phase 2 초기: graph.html을 iframe으로 임베드 (가장 빠름)
2. Phase 2 후기: @sigma/react로 커스텀 뷰어 구현 (검색, 필터, Ask AI 연동)

#### 2.4 Suggested Questions → Ask AI 연동

Graphify의 `analyze.py`가 생성하는 `suggested_questions`를 UI에 표시하고,
클릭 시 Ask AI로 라우팅:

```typescript
// SuggestedQuestions.tsx
function SuggestedQuestions({ questions }: { questions: string[] }) {
  const router = useRouter();

  return (
    <div>
      <h3>Graph Suggested Questions</h3>
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => router.push(`/ask?q=${encodeURIComponent(q)}`)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
```

#### 2.5 Phase 2 결과물 체크리스트

- [ ] `/architecture` 라우트 + 레이아웃 구현
- [ ] graph.html iframe 임베드 (Phase 2 초기 MVP)
- [ ] SnapshotSelector: graph_snapshot 목록 API + UI
- [ ] GodNodesCard: analysisMetadata에서 god nodes 표시
- [ ] CommunitiesPanel: community 목록 + 필터
- [ ] SuggestedQuestions → Ask AI 라우팅
- [ ] `/api/graphify/snapshots` CRUD API
- [ ] MinIO presigned URL로 graph.json/html 제공
- [ ] @sigma/react 커스텀 뷰어 (Phase 2 후기)
- [ ] 노드 클릭 → 사이드바 상세 정보
- [ ] 검색 → 노드 하이라이트
- [ ] community 필터 → 색상 표시

---

### Phase 3: Graph-Native Retrieval — Ask AI 구조 강화 (4주)

**목표**: graph.json의 node/edge를 DB에 물질화하고,
Ask AI가 구조 질문에 graph path/context를 함께 사용하여 답변하게 만든다.

#### 3.1 Graph DB 테이블 확장

**스키마**: `packages/db/schema/graph.ts` 확장

```typescript
// graph_snapshot은 Phase 1에서 이미 생성

export const graphNode = pgTable('graph_node', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotId: uuid('snapshot_id').notNull().references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 500 }).notNull(),  // graphify의 node.id
  label: varchar('label', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),  // code | document | paper | image | rationale
  sourceFile: varchar('source_file', { length: 1000 }),
  sourceLocation: varchar('source_location', { length: 50 }),
  communityId: integer('community_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotNodeIdx: index('idx_graph_node_snapshot_node')
    .on(table.snapshotId, table.nodeId),
  communityIdx: index('idx_graph_node_community')
    .on(table.snapshotId, table.communityId),
  labelIdx: index('idx_graph_node_label')
    .on(table.label),
  // FTS 인덱스 (label + sourceFile 기반)
  searchIdx: index('idx_graph_node_search')
    .using('gin', sql`to_tsvector('simple', ${table.label} || ' ' || coalesce(${table.sourceFile}, ''))`),
}));

export const graphEdge = pgTable('graph_edge', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotId: uuid('snapshot_id').notNull().references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  sourceNodeId: varchar('source_node_id', { length: 500 }).notNull(),
  targetNodeId: varchar('target_node_id', { length: 500 }).notNull(),
  relation: varchar('relation', { length: 100 }).notNull(),
    // calls | imports | imports_from | contains | method |
    // semantically_similar_to | rationale_for
  confidence: varchar('confidence', { length: 20 }).notNull(),
    // EXTRACTED | INFERRED | AMBIGUOUS
  confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
  sourceFile: varchar('source_file', { length: 1000 }),
  weight: numeric('weight', { precision: 5, scale: 2 }).default('1.0'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotSourceIdx: index('idx_graph_edge_snapshot_source')
    .on(table.snapshotId, table.sourceNodeId),
  snapshotTargetIdx: index('idx_graph_edge_snapshot_target')
    .on(table.snapshotId, table.targetNodeId),
  relationIdx: index('idx_graph_edge_relation')
    .on(table.snapshotId, table.relation),
}));

export const graphCommunity = pgTable('graph_community', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotId: uuid('snapshot_id').notNull().references(() => graphSnapshot.id, { onDelete: 'cascade' }),
  communityId: integer('community_id').notNull(),
  label: varchar('label', { length: 500 }),  // 대표 노드 이름 또는 자동 생성 레이블
  nodeCount: integer('node_count').notNull(),
  cohesionScore: numeric('cohesion_score', { precision: 3, scale: 2 }),
  topNodes: jsonb('top_nodes').default([]),  // 상위 N개 노드 ID 목록
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotCommunityIdx: unique('uq_graph_community_snapshot')
    .on(table.snapshotId, table.communityId),
}));
```

**마이그레이션**:
```sql
CREATE TABLE graph_node (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES graph_snapshot(id) ON DELETE CASCADE,
  node_id VARCHAR(500) NOT NULL,
  label VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  source_file VARCHAR(1000),
  source_location VARCHAR(50),
  community_id INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_graph_node_snapshot_node ON graph_node(snapshot_id, node_id);
CREATE INDEX idx_graph_node_community ON graph_node(snapshot_id, community_id);
CREATE INDEX idx_graph_node_label ON graph_node(label);
CREATE INDEX idx_graph_node_search ON graph_node
  USING GIN (to_tsvector('simple', label || ' ' || coalesce(source_file, '')));

CREATE TABLE graph_edge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES graph_snapshot(id) ON DELETE CASCADE,
  source_node_id VARCHAR(500) NOT NULL,
  target_node_id VARCHAR(500) NOT NULL,
  relation VARCHAR(100) NOT NULL,
  confidence VARCHAR(20) NOT NULL,
  confidence_score NUMERIC(3,2),
  source_file VARCHAR(1000),
  weight NUMERIC(5,2) DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_graph_edge_snapshot_source ON graph_edge(snapshot_id, source_node_id);
CREATE INDEX idx_graph_edge_snapshot_target ON graph_edge(snapshot_id, target_node_id);
CREATE INDEX idx_graph_edge_relation ON graph_edge(snapshot_id, relation);

CREATE TABLE graph_community (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES graph_snapshot(id) ON DELETE CASCADE,
  community_id INTEGER NOT NULL,
  label VARCHAR(500),
  node_count INTEGER NOT NULL,
  cohesion_score NUMERIC(3,2),
  top_nodes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_id, community_id)
);
```

#### 3.2 graph.json → DB Materialization

**작업**:
- `graphify-build` handler에서 graph.json 파싱 후 graph_node / graph_edge / graph_community에 bulk insert

**Materialization 로직**:
```typescript
// apps/worker/src/helpers/materialize-graph.ts (신규)

import type { GraphJson, GraphJsonNode, GraphJsonLink } from '../types/graphify';

interface GraphJson {
  directed: boolean;
  multigraph: boolean;
  graph: { hyperedges?: any[] };
  nodes: GraphJsonNode[];
  links: GraphJsonLink[];
}

interface GraphJsonNode {
  id: string;
  label: string;
  file_type: string;
  source_file: string;
  source_location?: string;
  community?: number;
}

interface GraphJsonLink {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  confidence_score?: number;
  _src?: string;
  _tgt?: string;
  weight?: number;
}

async function materializeGraph(
  snapshotId: string,
  graphJson: GraphJson,
): Promise<{ nodeCount: number; edgeCount: number; communityCount: number }> {

  // 1. Batch insert nodes (500개씩)
  const nodeBatches = chunk(graphJson.nodes, 500);
  for (const batch of nodeBatches) {
    await db.insert(graphNode).values(
      batch.map((n) => ({
        snapshotId,
        nodeId: n.id,
        label: n.label,
        fileType: n.file_type,
        sourceFile: n.source_file,
        sourceLocation: n.source_location,
        communityId: n.community,
      }))
    );
  }

  // 2. Batch insert edges (500개씩)
  const edgeBatches = chunk(graphJson.links, 500);
  for (const batch of edgeBatches) {
    await db.insert(graphEdge).values(
      batch.map((e) => ({
        snapshotId,
        sourceNodeId: e._src || e.source,
        targetNodeId: e._tgt || e.target,
        relation: e.relation,
        confidence: e.confidence,
        confidenceScore: e.confidence_score?.toString(),
        weight: e.weight?.toString(),
      }))
    );
  }

  // 3. Compute communities from nodes
  const communityMap = new Map<number, string[]>();
  for (const node of graphJson.nodes) {
    if (node.community == null) continue;
    if (!communityMap.has(node.community)) communityMap.set(node.community, []);
    communityMap.get(node.community)!.push(node.id);
  }

  for (const [cid, nodeIds] of communityMap) {
    // 대표 노드: 해당 community에서 가장 많은 edge를 가진 노드
    const topNodes = findTopNodes(graphJson, nodeIds, 5);
    await db.insert(graphCommunity).values({
      snapshotId,
      communityId: cid,
      label: topNodes[0]?.label || `Community ${cid}`,
      nodeCount: nodeIds.length,
      topNodes: topNodes.map((n) => n.id),
    });
  }

  return {
    nodeCount: graphJson.nodes.length,
    edgeCount: graphJson.links.length,
    communityCount: communityMap.size,
  };
}
```

#### 3.3 retrieveRelevantGraphContext() — Ask AI 확장

**작업**:
- `packages/ai/ask.ts`에 graph context retrieval 함수 추가
- 기존 `retrieveRelevantClaims()`와 병렬 실행
- Ask AI context에 graph path/neighbor 정보를 XML로 주입

**구현**:
```typescript
// packages/ai/graph-context.ts (신규)

interface GraphContext {
  matchedNodes: GraphNodeResult[];
  relatedNodes: GraphNodeResult[];
  paths: GraphPath[];
  communityContext: string;
}

interface GraphNodeResult {
  nodeId: string;
  label: string;
  fileType: string;
  sourceFile: string;
  communityLabel: string;
  connections: { relation: string; targetLabel: string; confidence: string }[];
}

interface GraphPath {
  from: string;
  to: string;
  hops: { nodeLabel: string; relation: string }[];
}

async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
): Promise<GraphContext | null> {

  // 1. 최신 completed snapshot 조회
  const snapshot = await db.query.graphSnapshot.findFirst({
    where: and(
      eq(graphSnapshot.workspaceId, workspaceId),
      eq(graphSnapshot.buildStatus, 'completed'),
    ),
    orderBy: desc(graphSnapshot.createdAt),
  });
  if (!snapshot) return null;

  // 2. 질문에서 키워드 추출 (간단한 토크나이즈)
  const keywords = extractKeywords(question);

  // 3. graph_node에서 키워드 매칭 (FTS + label ILIKE)
  const matchedNodes = await db.execute(sql`
    SELECT gn.*, gc.label as community_label
    FROM graph_node gn
    LEFT JOIN graph_community gc
      ON gc.snapshot_id = gn.snapshot_id AND gc.community_id = gn.community_id
    WHERE gn.snapshot_id = ${snapshot.id}
      AND (
        to_tsvector('simple', gn.label || ' ' || coalesce(gn.source_file, ''))
        @@ to_tsquery('simple', ${keywords.join(' | ')})
        OR gn.label ILIKE ANY(${keywords.map(k => `%${k}%`)})
      )
    LIMIT 10
  `);

  if (matchedNodes.length === 0) return null;

  // 4. 매칭 노드의 1-hop neighbors 조회
  const nodeIds = matchedNodes.map(n => n.nodeId);
  const neighbors = await db.execute(sql`
    SELECT
      ge.source_node_id, ge.target_node_id, ge.relation, ge.confidence,
      gn_src.label as source_label, gn_tgt.label as target_label
    FROM graph_edge ge
    JOIN graph_node gn_src ON gn_src.snapshot_id = ge.snapshot_id AND gn_src.node_id = ge.source_node_id
    JOIN graph_node gn_tgt ON gn_tgt.snapshot_id = ge.snapshot_id AND gn_tgt.node_id = ge.target_node_id
    WHERE ge.snapshot_id = ${snapshot.id}
      AND (ge.source_node_id = ANY(${nodeIds}) OR ge.target_node_id = ANY(${nodeIds}))
    LIMIT 50
  `);

  // 5. 2개 이상 매칭 노드가 있으면 shortest path (CTE)
  const paths: GraphPath[] = [];
  if (matchedNodes.length >= 2) {
    const path = await findShortestPath(
      snapshot.id,
      matchedNodes[0].nodeId,
      matchedNodes[1].nodeId,
      5, // max hops
    );
    if (path) paths.push(path);
  }

  // 6. community context
  const communityIds = [...new Set(matchedNodes.map(n => n.communityId).filter(Boolean))];
  const communities = await db.query.graphCommunity.findMany({
    where: and(
      eq(graphCommunity.snapshotId, snapshot.id),
      inArray(graphCommunity.communityId, communityIds),
    ),
  });

  return {
    matchedNodes: formatNodes(matchedNodes),
    relatedNodes: formatNeighbors(neighbors, nodeIds),
    paths,
    communityContext: formatCommunities(communities),
  };
}
```

**Shortest Path (PostgreSQL CTE)**:
```typescript
async function findShortestPath(
  snapshotId: string,
  fromNodeId: string,
  toNodeId: string,
  maxHops: number,
): Promise<GraphPath | null> {
  const result = await db.execute(sql`
    WITH RECURSIVE path_search AS (
      -- Base case: start from source node
      SELECT
        source_node_id AS current,
        target_node_id AS next_node,
        relation,
        ARRAY[source_node_id] AS visited,
        1 AS depth
      FROM graph_edge
      WHERE snapshot_id = ${snapshotId}
        AND source_node_id = ${fromNodeId}

      UNION ALL

      -- Recursive: follow edges
      SELECT
        ps.next_node,
        ge.target_node_id,
        ge.relation,
        ps.visited || ps.next_node,
        ps.depth + 1
      FROM path_search ps
      JOIN graph_edge ge ON ge.snapshot_id = ${snapshotId}
        AND ge.source_node_id = ps.next_node
      WHERE ps.depth < ${maxHops}
        AND NOT ps.next_node = ANY(ps.visited)  -- prevent cycles
    )
    SELECT visited || next_node AS path, depth
    FROM path_search
    WHERE next_node = ${toNodeId}
    ORDER BY depth ASC
    LIMIT 1
  `);

  // ... path 결과 파싱 및 반환
}
```

#### 3.4 Ask AI Context 주입

**작업**:
- `packages/ai/ask.ts`의 `generateAnswer()`에서 graph context를 추가 XML로 주입
- 기존 `<context>` 블록 아래에 `<graph_context>` 블록 추가

**수정된 Context Format**:
```xml
<context>
  <source id="1" title="Page Title" url="/knowledge/uuid">Claim text excerpt</source>
  ...
</context>

<graph_context>
  <matched_nodes>
    <node label="BaseClient" type="code" file="client.py:42" community="HTTP Layer">
      <connection relation="calls" target="RequestBuilder" confidence="EXTRACTED" />
      <connection relation="method" target="send()" confidence="EXTRACTED" />
    </node>
  </matched_nodes>
  <paths>
    <path from="BaseClient" to="ResponseParser">
      BaseClient --[calls]--> RequestBuilder --[calls]--> ResponseParser
    </path>
  </paths>
  <community_context>
    Community "HTTP Layer" (12 nodes): BaseClient, RequestBuilder, ResponseParser, ...
  </community_context>
</graph_context>
```

**System Prompt 확장**:
```
You are Jarvis, an internal knowledge assistant for an enterprise portal.
Answer ONLY based on the provided context sources and graph context. Do not use outside knowledge.

For text-based answers, cite sources using [source:N] notation.
For structure-based answers (architecture, connections, flow), reference the graph context.
When a question asks about relationships, dependencies, or "how does X connect to Y",
prefer the graph context over text sources.

If the context doesn't contain enough information, say so explicitly.
Keep answers concise and professional. Use the same language as the user's question.
```

#### 3.5 ResourceType 확장

**작업**:
- `packages/search/types.ts`의 `ResourceType`에 `'graph'` 추가
- 검색 결과에 graph node/community도 포함 가능하게 확장

**수정**:
```typescript
// packages/search/types.ts
export type ResourceType = 'knowledge' | 'project' | 'system' | 'graph';
```

**Graph 검색 통합** (pg-search.ts에 추가):
```typescript
// graph node 검색 결과도 SearchHit으로 변환
async searchGraphNodes(query: string, workspaceId: string): Promise<SearchHit[]> {
  // graph_node에서 FTS 검색
  // SearchHit으로 변환 (resourceType: 'graph')
  // URL: /architecture?node=${nodeId}
}
```

#### 3.6 MCP Server 통합 (선택적)

**작업**:
- Graphify의 `serve.py`를 별도 프로세스로 상주시키고
- Jarvis API에서 MCP client로 query

**아키텍처**:
```
Jarvis API  ──(MCP stdio)──→  graphify serve graph.json
                                │
                                ├── query_graph(question)
                                ├── get_neighbors(label)
                                ├── shortest_path(src, tgt)
                                ├── god_nodes(top_n)
                                └── graph_stats()
```

**장점**: Graphify의 BFS/DFS traversal, token budgeting을 그대로 활용
**단점**: Python 프로세스 관리 복잡성 증가

**추천**: Phase 3 후기에 평가. DB 기반 CTE 쿼리가 충분하면 불필요.

#### 3.7 Incremental Graph Update

**작업**:
- 파일이 추가/변경될 때 전체 rebuild 대신 incremental update
- Graphify의 `--update` 플래그 활용 (SHA256 캐시 기반)

**흐름**:
```
새 파일 업로드 → graphify-build job (--update)
  → 변경된 파일만 re-extract
  → 기존 graph.json에 merge
  → re-cluster + re-analyze
  → graph_node/edge DB 갱신 (diff-based upsert)
```

**DB 갱신 전략**:
```typescript
// Diff-based upsert
// 1. 기존 snapshot의 node/edge를 nodeId 기준으로 map 생성
// 2. 새 graph.json의 node/edge와 비교
// 3. 새로 추가된 것 → INSERT
// 4. 변경된 것 → UPDATE
// 5. 삭제된 것 → DELETE
// 6. 변경 없는 것 → SKIP
```

#### 3.8 Phase 3 결과물 체크리스트

- [ ] graph_node, graph_edge, graph_community 테이블 생성 + 마이그레이션
- [ ] graph.json → DB materialization 로직 (bulk insert, batch 500)
- [ ] retrieveRelevantGraphContext() 구현
  - [ ] 키워드 추출
  - [ ] graph_node FTS 매칭
  - [ ] 1-hop neighbors 조회
  - [ ] shortest path CTE
  - [ ] community context 조회
- [ ] Ask AI context에 `<graph_context>` XML 주입
- [ ] System prompt 확장 (구조 질문 가이드)
- [ ] ResourceType에 'graph' 추가
- [ ] SearchHit에 graph node 결과 포함
- [ ] Architecture 페이지에서 노드 클릭 → Ask AI 연동
- [ ] Incremental update (--update) 지원
- [ ] Diff-based DB upsert
- [ ] MCP server 통합 평가 (optional)
- [ ] E2E 테스트: "이 함수는 어떤 모듈과 연결되어 있나?" → graph context 포함 답변

---

## 5. 데이터 흐름 상세

### 5.1 Phase 1 데이터 흐름

```
ZIP Upload
  │
  ▼
raw_source (ingestStatus: 'pending')
  │
  ├──→ ingest job (기존: text extraction)
  │     └──→ parsedContent 저장
  │
  └──→ graphify-build job (신규)
        │
        ▼
      Python subprocess: graphify <dir> --no-viz --wiki
        │
        ├──→ graphify-out/graph.json ──→ MinIO (graphify/{wsId}/{snapId}/graph.json)
        │
        ├──→ graphify-out/GRAPH_REPORT.md
        │     └──→ knowledge_page (pageType: 'analysis', title: '[Graph] Architecture Report')
        │           └──→ compile job → embed job → knowledge_claim (searchable!)
        │
        ├──→ graphify-out/wiki/*.md
        │     └──→ knowledge_page × N (pageType: 'analysis', title: '[Graph] Community X')
        │           └──→ compile job → embed job → knowledge_claim × N
        │
        └──→ graph_snapshot record (nodeCount, edgeCount, buildStatus: 'completed')
```

### 5.2 Phase 3 데이터 흐름

```
Ask AI Question: "BaseClient는 어떤 모듈과 연결돼 있어?"
  │
  ├──→ retrieveRelevantClaims() [기존, 병렬]
  │     └──→ vector search → FTS rerank → top 5 claims
  │
  └──→ retrieveRelevantGraphContext() [신규, 병렬]
        │
        ├──→ extractKeywords("BaseClient", "모듈", "연결")
        │
        ├──→ graph_node FTS: label @@ 'BaseClient'
        │     └──→ matched: [{nodeId: "baseclient", label: "BaseClient", community: 3}]
        │
        ├──→ graph_edge: source_node_id = 'baseclient' OR target_node_id = 'baseclient'
        │     └──→ neighbors: [{calls: "RequestBuilder"}, {method: "send()"}, ...]
        │
        └──→ graph_community: communityId = 3
              └──→ "HTTP Layer" (12 nodes): BaseClient, RequestBuilder, ...

  │
  ▼
generateAnswer() with combined context:
  <context>
    <source id="1" title="HTTP Client Guide">BaseClient handles connection pooling...</source>
  </context>
  <graph_context>
    <node label="BaseClient" community="HTTP Layer">
      calls → RequestBuilder, ConnectionPool
      method → send(), close()
    </node>
  </graph_context>

  │
  ▼
Claude 답변:
  "BaseClient는 HTTP Layer 커뮤니티에 속하며, RequestBuilder를 호출하여 요청을 구성하고,
   ConnectionPool을 통해 연결을 관리합니다. [source:1] 주요 메서드는 send()와 close()입니다.
   이 클래스는 12개 노드로 구성된 HTTP Layer의 핵심 허브(god node)입니다."
```

---

## 6. 기술적 고려사항

### 6.1 성능

| 관심사 | 대응 |
|--------|------|
| Graphify 빌드 시간 (대규모 repo) | worker에서 비동기, 10분 타임아웃, 빌드 중 UI에 상태 표시 |
| graph.json 크기 (5000+ nodes) | MinIO 저장, 필요 시만 fetch, DB materialization으로 쿼리 최적화 |
| DB bulk insert 성능 | 500개씩 batch, 트랜잭션 분리 |
| graph_node FTS 성능 | GIN 인덱스, to_tsvector('simple', label \|\| source_file) |
| CTE shortest path 성능 | max_hops=5 제한, cycle prevention (visited array) |
| 동시 빌드 방지 | pg-boss batchSize: 1, workspace별 중복 빌드 체크 |

### 6.2 보안

| 관심사 | 대응 |
|--------|------|
| 민감 파일 노출 | Graphify detect.py가 .env/credential 스킵 + Jarvis sensitivity 체계 |
| SQL injection (graph 쿼리) | Drizzle ORM parameterized queries, 필터 whitelist |
| SSRF (URL ingest) | Graphify security.py의 URL validation + private IP blocking 재사용 |
| Path traversal | Graphify validate_graph_path() + tempdir 격리 |
| 권한 | graph_snapshot에 workspaceId 바인딩, ACL은 기존 체계 |

### 6.3 에러 핸들링

| 시나리오 | 처리 |
|----------|------|
| Python 미설치 | graphify-build 시작 시 체크, 즉시 실패 + 명확한 에러 메시지 |
| Graphify 빌드 실패 | graph_snapshot.buildStatus='failed', buildError에 stderr 저장 |
| graph.json 파싱 오류 | validate.py 검증 후 DB insert, 검증 실패 시 빌드 실패 처리 |
| 빌드 타임아웃 (10분) | subprocess kill, 빌드 실패 처리, 큰 repo는 --update 사용 권장 |
| MinIO 업로드 실패 | pg-boss 재시도 (3회, 30초 간격) |
| knowledge_page import 실패 | 트랜잭션 롤백, 부분 성공 허용 (report는 성공, wiki 일부 실패 가능) |

### 6.4 의존성 관리

| 의존성 | 버전 | 용도 | 설치 위치 |
|--------|------|------|-----------|
| Python | 3.10+ | Graphify 런타임 | Worker 서버/Docker |
| graphifyy (PyPI) | latest | Core 패키지 | pip (venv) |
| networkx | (graphifyy 의존) | Graph 자료구조 | pip |
| tree-sitter + bindings | (graphifyy 의존) | AST 추출 | pip |
| graspologic | (graphifyy optional) | Leiden community detection | pip |

**Node.js 쪽 추가 의존성 없음** — subprocess로 Python 호출하므로.

---

## 7. 테스트 전략

### 7.1 Unit Tests

```
apps/worker/src/handlers/__tests__/
├── graphify-build.test.ts      # handler 로직 (Python 호출은 mock)
├── import-knowledge.test.ts    # knowledge page import 로직
└── materialize-graph.test.ts   # graph.json → DB 로직

packages/ai/__tests__/
└── graph-context.test.ts       # retrieveRelevantGraphContext 로직
```

**테스트 fixtures**:
```
apps/worker/src/__fixtures__/
├── sample-graph.json           # Graphify worked/httpx/ 결과 복사
├── sample-report.md            # GRAPH_REPORT.md 샘플
└── sample-wiki/                # wiki/*.md 샘플
```

### 7.2 Integration Tests

| 테스트 | 검증 내용 |
|--------|-----------|
| graphify-build E2E | zip 업로드 → job 실행 → graph.json 생성 → knowledge import |
| search integration | graph import 후 → "architecture" 검색 → report/wiki hit |
| ask integration | "이 코드의 핵심 추상화는?" → graph context 포함 답변 |

### 7.3 Manual Testing Checklist

- [ ] 작은 repo (5-10 files) zip 업로드 → 빌드 성공 확인
- [ ] 중간 repo (50+ files) zip 업로드 → 빌드 성공 + 10분 내 완료
- [ ] 빌드 완료 후 Search에서 "[Graph]" prefix 페이지 검색 가능
- [ ] Ask AI에서 "이 프로젝트의 god node는?" → 답변 확인
- [ ] Architecture 페이지에서 graph 시각화 확인
- [ ] 빌드 실패 시 에러 메시지 + 재시도 가능 여부 확인

---

## 8. 마일스톤 및 일정 (예상)

| 마일스톤 | Phase | 산출물 |
|----------|-------|--------|
| M1: Python 환경 + 기본 Job | Phase 1 Week 1 | graphify-build handler 동작 |
| M2: Knowledge Import + E2E | Phase 1 Week 2 | zip → search/ask에서 구조 질문 가능 |
| M3: Architecture Viewer MVP | Phase 2 Week 1-2 | graph.html iframe + snapshot selector |
| M4: Custom Graph Viewer | Phase 2 Week 3 | @sigma/react + sidebar + god nodes |
| M5: DB Materialization | Phase 3 Week 1-2 | graph_node/edge 테이블 + bulk import |
| M6: Graph-Aware Ask AI | Phase 3 Week 3-4 | retrieveRelevantGraphContext + context injection |

---

## 9. 리스크 및 완화

| 리스크 | 확률 | 영향 | 완화 |
|--------|------|------|------|
| Python subprocess가 Windows에서 문제 | 중 | 높 | Docker 기반 배포로 Linux 환경 보장 |
| 대규모 repo 빌드 시 메모리 초과 | 중 | 중 | corpus health check 경고, --update 사용, 파일 수 제한 |
| Graphify API 변경 (PyPI 업데이트) | 낮 | 중 | 버전 고정 (pip install graphifyy==X.Y.Z) |
| graph.json 스키마 변경 | 낮 | 높 | validate.py 재사용, 스키마 검증 후 insert |
| 빌드 큐 병목 (동시 요청 많을 때) | 중 | 중 | batchSize: 1 유지, priority queue, 사용자별 동시 빌드 제한 |

---

## 10. 향후 확장 가능성

### 10.1 URL Ingest 연동

Graphify의 `ingest.py`는 arXiv, GitHub, tweet, PDF URL을 fetch하여 corpus에 추가한다.
Jarvis에 "URL로 지식 추가" 기능을 붙일 때 이 모듈을 재사용 가능.

### 10.2 Git Hook 연동

Graphify의 `hooks.py`는 post-commit/post-checkout에서 그래프를 자동 재빌드한다.
Jarvis에 Git 연동 기능을 추가하면, push event마다 자동으로 graph update 가능.

### 10.3 Obsidian/Neo4j Export

Graphify가 지원하는 Obsidian vault, Neo4j Cypher export를 Jarvis에서도 제공 가능.
특히 Neo4j는 대규모 그래프에서 복잡한 traversal이 필요할 때 유용.

### 10.4 Multi-Language Highlighting

Architecture Viewer에서 노드 클릭 → 소스 코드 위치(sourceLocation) → 코드 하이라이트.
Graphify가 19언어 AST를 지원하므로, 어떤 언어 repo든 코드 탐색 가능.

### 10.5 Watch Mode (Live Sync)

Graphify의 `watch.py`를 활용하여, 연결된 Git repo의 변경을 실시간 감지하고
그래프를 자동 갱신하는 live sync 기능.

---

## 11. 파일 변경 요약 (전체)

### 신규 파일

```
apps/worker/src/handlers/graphify-build.ts         # Phase 1: 핵심 job handler
apps/worker/src/helpers/import-knowledge.ts         # Phase 1: knowledge import 헬퍼
apps/worker/src/helpers/materialize-graph.ts        # Phase 3: graph.json → DB
apps/worker/src/types/graphify.ts                   # 공용: GraphJson 타입 정의
apps/worker/scripts/setup-python.sh                 # Phase 1: Python 환경 셋업

packages/db/schema/graph.ts                         # Phase 1+3: graph 테이블 스키마
packages/db/migrations/XXXX_add_graph_tables.sql    # Phase 1+3: 마이그레이션

packages/ai/graph-context.ts                        # Phase 3: graph context retrieval

apps/web/app/api/graphify/build/route.ts                    # Phase 1: 수동 빌드 API
apps/web/app/api/graphify/snapshots/route.ts                # Phase 2: snapshot 목록
apps/web/app/api/graphify/snapshots/[id]/route.ts           # Phase 2: snapshot 상세
apps/web/app/api/graphify/snapshots/[id]/graph/route.ts     # Phase 2: graph presign

apps/web/app/(workspace)/workspace/[workspaceId]/architecture/
├── page.tsx                                        # Phase 2: 메인 페이지
├── components/GraphViewer.tsx                      # Phase 2: 그래프 뷰어
├── components/GraphSidebar.tsx                     # Phase 2: 노드 상세
├── components/SnapshotSelector.tsx                 # Phase 2: snapshot 선택
├── components/GodNodesCard.tsx                     # Phase 2: god nodes
├── components/CommunitiesPanel.tsx                 # Phase 2: communities
├── components/SurprisingCard.tsx                   # Phase 2: surprising connections
├── components/SuggestedQuestions.tsx                # Phase 2: suggested questions
├── hooks/useGraphData.ts                           # Phase 2: graph data hook
└── hooks/useGraphNavigation.ts                     # Phase 2: navigation hook
```

### 수정 파일

```
apps/worker/src/index.ts            # Phase 1: graphify-build job 등록
apps/worker/Dockerfile              # Phase 1: Python layer 추가
apps/web/app/api/upload/route.ts    # Phase 1: zip 시 graphify-build enqueue
packages/ai/ask.ts                  # Phase 3: graph context 병렬 retrieval + context injection
packages/search/types.ts            # Phase 3: ResourceType에 'graph' 추가
packages/search/pg-search.ts        # Phase 3: graph node 검색 통합
packages/db/schema/index.ts         # Phase 1: graph 스키마 export
packages/shared/types/page.ts       # Phase 3: PAGE_TYPES에 'architecture' 추가 (optional)
```

---

## 12. 의사결정 로그

| 일자 | 결정 | 근거 | 대안 (기각) |
|------|------|------|-------------|
| 2026-04-09 | Python subprocess 방식 채택 | Graphify는 Python, Jarvis는 Node; FFI/WASM 불필요 | Node.js port (비용 과대), Docker sidecar (복잡) |
| 2026-04-09 | graph.json → PG 테이블 물질화 | 기존 PG 인프라 활용, CTE로 graph query 가능 | Neo4j 추가 (의존성 과다), in-memory NetworkX만 (영속성 없음) |
| 2026-04-09 | MVP는 knowledge import | 기존 파이프라인 100% 재사용, 추가 개발 최소 | 바로 graph DB 구축 (Phase 1에 과중) |
| 2026-04-09 | Phase 2 초기에 iframe 임베드 | graph.html 이미 완성품, 즉시 사용 가능 | 커스텀 뷰어만 (개발 시간 길어짐) |
| 2026-04-09 | MCP server는 Phase 3 후기 평가 | DB CTE가 충분하면 불필요, 프로세스 관리 복잡 | 즉시 MCP 통합 (과도한 의존성) |
