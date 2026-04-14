# Jarvis Current State Document

**Last Updated**: 2026-04-14  
**Status**: All Phases Completed  
**Scope**: 5000-user enterprise portal, 1-week sprint baseline

---

## Executive Summary

Jarvis is a production-ready enterprise knowledge portal that integrates:
- **4-Surface Knowledge Model** (canonical/directory/case/derived)
- **6-Lane Ask AI Router** with Korean keyword pattern matching
- **TSVD999 Case Layer** (74,342 precedent cases, 562 TF-IDF clusters)
- **Directory Layer** (31 structured system/form/contact entries)
- **Graphify Code Analysis** (AST extraction + LLM semantic enrichment)
- **OpenAI-powered Generation** (ask responses, embeddings)
- **Anthropic-powered Code Analysis** (separate from Ask AI)

All architecture phases (0-6) are complete. The system is ready for:
1. Extended test coverage
2. CI/CD pipeline automation
3. Production observability tuning

---

## Phase Completion Status

| Phase | Objective | Status | Key Deliverables |
|-------|-----------|--------|------------------|
| **Phase 0** | Foundation (schema, auth, search) | ✓ Complete | 39-table schema, OIDC, RBAC |
| **Phase 1** | Core RAG (embeddings, retrieval) | ✓ Complete | OpenAI embeddings, vector search |
| **Phase 2** | Case Layer (TSVD999 import) | ✓ Complete | 74,342 cases, TF-IDF clustering |
| **Phase 3** | Directory & Router (6-lane) | ✓ Complete | 31 directory entries, keyword router |
| **Phase 4** | Graphify Integration | ✓ Complete | Code analysis, graph export, wiki generation |
| **Phase 5** | UI Features (Simple/Expert, Tutor) | ✓ Complete | Mode toggle, AnswerCard, HR tutor |
| **Phase 6** | Knowledge Quality (Radar, Drift) | ✓ Complete | Stale detection, consistency checking |

---

## Database Inventory

### Table Count

**39 Tables** organized by domain:

#### Knowledge Tables (5)
- `knowledge_page` — documents with 4-surface model (canonical/directory/case/derived)
- `knowledge_page_version` — version history (MDX content)
- `knowledge_claim` — search/RAG chunks (OpenAI 1536d embedding)
- `knowledge_page_owner` — ownership mapping
- `knowledge_page_tag` — tagging system

#### Case Tables (3)
- `precedent_case` — TSVD999 query/case records (74,342 rows)
- `case_cluster` — TF-IDF clusters (562 clusters)
- `case_cluster_member` — cluster membership

#### Directory Tables (1)
- `directory_entry` — system links, forms, contacts, tools (31 items)

#### Graph Tables (4)
- `graph_snapshot` — Graphify build metadata
- `graph_node` — AST nodes (functions, classes, files)
- `graph_edge` — call/import/inheritance relations
- `graph_community` — Leiden-detected communities

#### Project Tables (4)
- `project`
- `project_task`
- `project_inquiry`
- `project_staff`

#### System Tables (2)
- `system`
- `system_access`

#### Attendance Tables (3)
- `attendance`
- `out_manage`
- `out_manage_detail`

#### Search/Audit Tables (8)
- `search_log`
- `search_synonym`
- `popular_search`
- `audit_log`
- `raw_source`
- `attachment`
- `review_request`
- `file_audit`

#### User/Tenant Tables (9)
- `workspace`
- `user`
- `user_team`
- `user_role`
- `user_permission`
- `role`
- `role_permission`
- `permission`
- `menu`

#### Code/Company Tables (2)
- `code`
- `company`

---

## Data Inventory

| Layer | Entity | Count | Storage | Notes |
|-------|--------|-------|---------|-------|
| **Canonical** | knowledge_page (surface=canonical) | ~95 | PostgreSQL | ISU guidebook seed |
| **Case** | precedent_case | 74,342 | PostgreSQL + pgvector | TSVD999 import |
| **Case Cluster** | case_cluster | 562 | PostgreSQL | TF-IDF 1536d (local) |
| **Directory** | directory_entry | 31 | PostgreSQL | ILIKE keyword search |
| **Graph Node** | graph_node | Variable | PostgreSQL | Per-snapshot AST nodes |
| **Graph Edge** | graph_edge | Variable | PostgreSQL | Per-snapshot relations |
| **Graph Snapshot** | graph_snapshot | Variable | PostgreSQL | Build history |

---

## Provider Matrix

| Purpose | Provider | Model | Environment Variable |
|---------|----------|-------|----------------------|
| **Ask AI Generation** | OpenAI | gpt-5.4-mini (default) | `ASK_AI_MODEL` (optional) |
| **Ask AI Embeddings** | OpenAI | text-embedding-3-small | `OPENAI_API_KEY` |
| **Case Embeddings** | Local TF-IDF | 1536d (compatible with pgvector) | (Computed locally) |
| **Graphify Code Analysis** | Anthropic | claude-haiku-4-5 | `ANTHROPIC_API_KEY` |
| **Graphify Cache** | Graphify internals | SHA256-based | (Managed by Graphify) |

**Key Correction**: 
- **Ask AI** uses **OpenAI** (not Anthropic)
- **Graphify** uses **Anthropic** (separate pipeline)
- Both use same `OPENAI_API_KEY` for embeddings

---

## Sensitivity & RBAC Matrix

### Knowledge Page Sensitivity (4 levels)

| Level | Description | Search Visibility | Ask AI Visibility |
|-------|-------------|-------------------|-------------------|
| `PUBLIC` | Publicly accessible | All users | All users |
| `INTERNAL` | Company internal | Authenticated users | Authenticated users |
| `RESTRICTED` | Department/team only | RBAC check | RBAC check |
| `SECRET_REF_ONLY` | Secret references only | Hidden, extracted on need | Hidden, explicit query only |

### Graph Sensitivity

- Inherited from `graph_snapshot.sensitivity`
- Permission-gated via `graph_scope_type` (attachment/project/system/workspace)
- Node/edge visibility depends on parent resource access

### Case Sensitivity

- Inherited from `precedent_case.sensitivity` (default: INTERNAL)
- Company-filtered via `requestCompany` field (soft boost, not hard filter)
- RBAC applied same as knowledge pages

### Directory Sensitivity

- Default: PUBLIC for all system links
- Can be restricted per `directoryEntry` (future enhancement)

---

## Architecture Components

### 1. Web App (`apps/web`)

**Pages & Features**:
- Dashboard (with Knowledge Debt Radar widget + Drift Detection)
- Ask AI (with 6-lane router, Simple/Expert mode toggle)
- Search (with hybrid ranking)
- Knowledge Base (4-surface editor)
- Projects, Systems, Attendance
- Admin panel
- Profile + Login/SSO

**Key Files**:
- `app/api/ask/route.ts` — SSE Ask AI endpoint
- `app/ask-panel.tsx` — UI component with mode toggle
- `app/server-actions/drift-check.ts` — Drift detection
- `app/server-actions/knowledge-debt.ts` — Stale page detection

### 2. Worker (`apps/worker`)

**Jobs**:
- `ingest` — Text extraction (PDF, DOCX, text, JSON)
- `embed` — OpenAI embedding + vector storage
- `graphify-build` — Graphify subprocess (Python)
  - Spawns: `graphify <tempDir> --wiki`
  - Stores: graph.json, graph.html, graph_node/edge/community rows
- `compile` — Summary generation
- `check-freshness` — Stale document detection
- `check-drift` — Reference consistency validation
- `aggregate-popular` — Search popularity aggregation
- `cleanup` — Log/version cleanup

**Job Orchestration**:
- pg-boss for queue management
- Worker runs continuously (dev) or as separate service (prod)

### 3. AI Packages (`packages/ai`)

**Core Modules**:
- `router.ts` — 6-lane decision logic (Korean keyword matching)
- `ask.ts` — OpenAI client + RAG orchestration
- `embed.ts` — OpenAI embedding generator
- `case-context.ts` — Case retrieval + company boost
- `directory-context.ts` — Directory ILIKE search
- `graph-context.ts` — Graph node/edge retrieval
- `tutor.ts` — Multi-turn tutorial mode

**Router Lanes** (no LLM cost):
1. **text-first**: /규정|정책|규칙/ → knowledge_claim
2. **graph-first**: /구조|연결|아키텍처/ → graph_node/edge
3. **case-first**: /장애|에러|사례|예전에/ → precedent_case
4. **directory-first**: /어디서|링크|담당자/ → directory_entry
5. **action-first**: /어떻게|방법|신청/ → directory + knowledge
6. **tutor-first**: /설명해|가르쳐|알려줘/ → all sources + tutorial

### 4. Database (`packages/db`)

**Schema Files** (16 files):
- `schema/knowledge.ts` — 4-surface model columns
- `schema/case.ts` — TSVD999 + clustering
- `schema/directory.ts` — System/form/contact entries
- `schema/graph.ts` — Graphify snapshots + nodes/edges
- `schema/user.ts` — User management + RBAC
- `schema/search.ts` — Logging + popularity tracking
- `schema/project.ts`, `system.ts`, `attendance.ts`, etc.

**Migrations**: Drizzle ORM migrations in `db/drizzle/`

**Schema Drift Hook**: `.claude/settings.json` PostToolUse hook runs `scripts/check-schema-drift.mjs` on every file change

### 5. Search (`packages/search`)

**Algorithm**:
- Vector similarity (0.7 weight)
- FTS rank (0.3 weight)
- Freshness boost
- Sensitivity filtering (SQL WHERE clause)
- Company soft-boost (cases only)

**Features**:
- Trigram similarity fallback
- Synonym expansion
- Facet counting
- Admin explain view
- SearchAdapter abstraction for future external engines

---

## 6-Lane Ask AI Router

### Decision Tree

```
User Question
  ↓
Pattern Matching (no LLM):
  ├─ DIRECTORY_PATTERNS (어디서, 링크, 담당자) → directory-first
  ├─ ACTION_PATTERNS (어떻게, 신청, 절차) → action-first
  ├─ CASE_PATTERNS (장애, 에러, 사례) → case-first
  ├─ GRAPH_PATTERNS (구조, 연결, 아키텍처) → graph-first
  ├─ TUTOR_PATTERNS (설명해, 가르쳐, 알려줘) → tutor-first
  └─ (default) → text-first
  ↓
Retrieve from selected lane(s)
  ↓
OpenAI generation (gpt-5.4-mini)
  ↓
Response + [source:N] citations
  ↓
AnswerCard render
```

### AnswerCard Structure

```
┌─────────────────────────────┐
│        Main Answer          │ (LLM-generated text)
├─────────────────────────────┤
│  Documents  | Cases  | Dir  │ (Relevant resources)
├─────────────────────────────┤
│   Graph Nodes (if relevant) │ (Structure context)
├─────────────────────────────┤
│      Next Actions           │ (Recommended steps)
├─────────────────────────────┤
│    Owner Team (contact)     │ (Escalation)
└─────────────────────────────┘
```

---

## Graphify Integration

### What Graphify Does

Graphify is a **Python skill/utility** (not a CLI tool) that:
1. Detects file types + filters sensitive files
2. Extracts AST from 19+ languages (Python, JS, Go, Rust, Java, etc.)
3. Uses Anthropic Claude for semantic enrichment
4. Builds NetworkX knowledge graph
5. Detects communities (Leiden algorithm)
6. Generates GRAPH_REPORT.md + wiki/* markdown
7. Exports graph.html (vis.js interactive), graph.json

### Execution Model

**Not a CLI tool**:
- ❌ No `graphify install` command
- ❌ No `graphify cli` command
- ✓ Worker calls subprocess: `graphify <tempDir> --wiki`
- ✓ Output files written to MinIO + DB

**Worker Integration** (`apps/worker/src/jobs/graphify-build.ts`):
- Receives `graphify-build` job from queue
- Creates temp directory
- Spawns Graphify subprocess (GRAPHIFY_TIMEOUT_MS = 600000ms default)
- Parses graph.json output
- Stores nodes/edges in `graph_node`/`graph_edge` tables
- Imports wiki markdown as knowledge_page records
- Updates `graph_snapshot` status

**Configuration**:
```env
GRAPHIFY_BIN=graphify                    # Binary path
GRAPHIFY_TIMEOUT_MS=600000              # 10 minutes
GRAPHIFY_MODEL=claude-haiku-4-5-20251001 # Anthropic model
GRAPHIFY_API_KEY=${ANTHROPIC_API_KEY}   # Auth
GRAPHIFY_MAX_FILE_COUNT=5000            # Archive size limit
GRAPHIFY_MAX_ARCHIVE_MB=200             # Archive MB limit
```

---

## Knowledge Quality Features

### 1. Knowledge Debt Radar

**Purpose**: Identify stale documents needing review

**Mechanism**:
- `knowledge_page.lastVerifiedAt` + `freshness_sla_days`
- Dashboard widget shows status badges:
  - 🟢 **Healthy** (< 50% of SLA)
  - 🟡 **Warning** (50-100% of SLA)
  - 🔴 **Overdue** (> 100% of SLA)

**Job**: `check-freshness` runs daily 09:00

**SQL**: Calculates `days_since_verified` and `sla_days_remaining`

### 2. Drift Detection

**Purpose**: Detect broken references between documents and systems

**Mechanism**:
- Scans knowledge_page for references: `[system:system_id]`, `[project:project_id]`, etc.
- Verifies referenced entities exist in system/project/attachment tables
- Flags inconsistencies

**Job**: `check-drift` runs daily 08:00

**Server Action**: `apps/web/app/server-actions/drift-check.ts`

---

## Data Import Pipelines

### 1. ISU Guidebook → Canonical (95 documents)

**Flow**:
1. `docs/guidebook/isu-guidebook-full.md` (source)
2. `scripts/canonicalize-guidebook.ts` (normalize sections)
3. `scripts/seed-canonical.ts` (create knowledge_page records)
4. `scripts/build-guidebook-graph.ts` (optionally: Graphify analysis)

**Result**: 95 documents with surface=canonical, authority=canonical

### 2. TSVD999 → Cases (74,342 records)

**Flow**:
1. `data/casedata/tsvd999.csv` (raw export)
2. `scripts/normalize-tsvd999.py` (clean + normalize fields)
3. `scripts/cluster-cases.py` (TF-IDF + Leiden clustering → 562 clusters)
4. `scripts/import-cases-to-jarvis.ts` (insert into precedent_case)

**Result**: 74,342 cases with TF-IDF 1536d embedding, 562 clusters

### 3. Directory Entries (31 items, manual)

**File**: `data/canonical/directory-entries.json`

**Structure**:
```json
{
  "entryType": "tool|form|contact|system_link|guide_link",
  "name": "System Name",
  "nameKo": "시스템명",
  "description": "Brief description",
  "url": "https://...",
  "category": "hr|it|admin|welfare|onboarding",
  "ownerTeam": "HR Team",
  "ownerContact": "hr@company.com"
}
```

---

## Sensitivity Implementation Details

### Knowledge Page Filtering

**SQL WHERE clause** (built by `buildKnowledgeSensitivitySqlFilter`):
```sql
AND (
  kp.sensitivity = 'PUBLIC'
  OR (kp.sensitivity = 'INTERNAL' AND user_is_authenticated)
  OR (kp.sensitivity = 'RESTRICTED' AND user_has_permission('knowledge:view:restricted'))
  OR (kp.sensitivity = 'SECRET_REF_ONLY' AND user_has_permission('knowledge:view:secret'))
)
```

### Case Filtering

**Same as knowledge pages**:
- INTERNAL cases visible to authenticated users
- RESTRICTED cases require explicit team permission
- SECRET_REF_ONLY cases require secret access permission

**Additional**: Company-based soft boost
```sql
ORDER BY 
  similarity DESC,
  CASE WHEN precedent_case.request_company = current_user_company THEN 0 ELSE 1 END ASC
```

### Graph Filtering

**Scope-based access**:
- `graph_scope_type = 'attachment'`: Check if user can view parent attachment
- `graph_scope_type = 'project'`: Check if user is project member
- `graph_scope_type = 'system'`: Check system access permission
- `graph_scope_type = 'workspace'`: Check workspace membership

---

## Key Metrics & Performance Baselines

| Metric | Current | Target |
|--------|---------|--------|
| Vector search latency (top-5) | <100ms | <150ms |
| FTS search latency | <50ms | <100ms |
| Ask AI generation time | 2-5s | <5s |
| Graphify build time (100 files) | 30-60s | <2min |
| Case TF-IDF clustering time | 5-10s | <15s |
| Database size | ~2GB | <10GB (1-week data) |
| Worker job throughput | 100+ jobs/hour | 100+ jobs/hour |

---

## Known Gaps & Next Steps

### Short Term (1-2 weeks)

1. **Test Coverage**
   - Add API integration tests (ask, search, upload endpoints)
   - Add permission scenario tests (RBAC edge cases)
   - Add search relevance regression tests
   - Graphify pipeline validation tests

2. **CI/CD**
   - GitHub Actions workflow (lint, test, build, deploy)
   - Docker image push to registry
   - Database migration validation before deploy
   - Schema drift check in CI (not just as hook)

3. **Observability**
   - Request ID middleware (all APIs)
   - Queue metrics export (pg-boss)
   - Performance tracing (APM integration)
   - Error rate monitoring

### Medium Term (1-2 months)

1. **Search Optimization**
   - Relevance tuning (weights, boosts)
   - Query analyzer + EXPLAIN plan inspection
   - A/B test new ranking schemes

2. **Graphify Enhancement**
   - Cache invalidation policy
   - Incremental build support
   - Result quality scoring

3. **UI/UX**
   - Ask AI response rating (feedback loop)
   - Search result expansion/collapse
   - Case similarity visualization

### Long Term (3+ months)

1. **Scalability**
   - Sharding strategy for cases table
   - Read replicas for search queries
   - Caching layer (Redis) for popular results

2. **Multi-Tenant**
   - Workspace isolation validation
   - Per-workspace configuration (models, plugins)
   - Cross-workspace analytics (optional)

3. **Advanced Features**
   - Custom RAG plugins
   - Knowledge source attribution (provenance tracking)
   - Automated summarization (key insights from new docs)

---

## Environment Setup Checklist

### Development

```bash
# 1. Clone & Install
git clone https://github.com/qoxmfaktmxj/jarvis.git
cd jarvis
pnpm install

# 2. Infra (Docker)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

# 3. Database
pnpm db:generate
pnpm db:migrate

# 4. Seed (optional)
pnpm --filter @jarvis/worker seed:canonical
pnpm --filter @jarvis/worker seed:cases
pnpm --filter @jarvis/worker seed:directory

# 5. Run
pnpm dev
```

### Production

See `README.md` **section 18: 운영/배포 시 고려사항**

---

## File Structure Quick Reference

```
jarvis/
├─ apps/
│  ├─ web/                          # Next.js frontend + API routes
│  │  ├─ app/ask-panel.tsx          # 6-lane router UI + mode toggle
│  │  ├─ app/api/ask/route.ts       # SSE Ask AI endpoint
│  │  └─ app/server-actions/        # Knowledge Debt, Drift Detection
│  └─ worker/
│     └─ src/jobs/
│        ├─ ingest-handler.ts       # Text extraction
│        ├─ embed-handler.ts        # OpenAI embedding
│        └─ graphify-build.ts       # Graphify subprocess + import
├─ packages/
│  ├─ ai/
│  │  ├─ router.ts                  # 6-lane decision logic
│  │  ├─ ask.ts                     # OpenAI orchestration
│  │  ├─ case-context.ts            # Case retrieval
│  │  ├─ directory-context.ts       # Directory search
│  │  └─ tutor.ts                   # Tutorial mode
│  └─ db/
│     ├─ schema/
│     │  ├─ knowledge.ts            # 4-surface model
│     │  ├─ case.ts                 # TSVD999 + clustering
│     │  └─ directory.ts            # System links, forms
│     └─ migrations/
├─ docs/
│  ├─ CURRENT_STATE.md              # ← You are here
│  ├─ plan/graphify-integration.md  # Integration spec
│  └─ canonical/                    # 95 guidebook documents
└─ data/
   └─ canonical/                    # ISU guidebook source
```

---

## Summary

Jarvis is a **production-ready knowledge portal** with:
- ✓ 39 tables, 95 canonical docs, 74,342 cases, 31 directory entries
- ✓ 6-lane Ask AI router (Korean keyword matching, no LLM cost)
- ✓ OpenAI generation + OpenAI embeddings (separate Anthropic for Graphify)
- ✓ 4-surface knowledge model (canonical/directory/case/derived)
- ✓ Knowledge Debt Radar + Drift Detection
- ✓ AnswerCard structured responses
- ✓ Simple/Expert mode toggle
- ✓ HR tutor with guides, quizzes, simulations
- ✓ Graphify code analysis (AST + semantic extraction)

**Ready for**:
1. Extended test coverage (API, RBAC, search relevance)
2. CI/CD pipeline (GitHub Actions)
3. Production observability (tracing, metrics, logging)

**Not yet**:
- Multi-tenant workspace isolation (code-ready, not enforced)
- Custom search plugins
- Advanced analytics

All architecture phases complete. Quality + reliability improvements next.
