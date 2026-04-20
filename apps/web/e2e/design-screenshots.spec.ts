import { test, expect, type Page } from '@playwright/test';
import Redis from 'ioredis';
import pg from 'pg';
import { randomUUID } from 'crypto';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';
import path from 'path';

const OUT_DIR = path.resolve(__dirname, '../../../design-review/screenshots-all-2026-04-18');
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6380';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://jarvis:jarvispass@127.0.0.1:5436/jarvis';
const SESSION_PREFIX = 'jarvis:session:';
const SESSION_TTL = 60 * 60 * 8;

type SeedIds = {
  workspaceId: string;
  userId: string;
  employeeId: string;
  name: string;
  email: string;
  projectId: string | null;
  systemId: string | null;
  knowledgePageId: string | null;
  wikiPath: string | null;
};

async function loadSeedIds(): Promise<SeedIds> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const ws = await client.query(`SELECT id FROM workspace WHERE code = 'jarvis' LIMIT 1`);
    const u = await client.query(
      `SELECT id, employee_id, name, email FROM "user" WHERE email = 'admin@jarvis.dev' LIMIT 1`,
    );
    if (!ws.rows[0] || !u.rows[0]) {
      throw new Error('Seed data missing — run `pnpm db:seed` first');
    }
    const proj = await client.query(
      `SELECT id FROM project WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`,
      [ws.rows[0].id],
    );
    const sys = await client.query(
      `SELECT id FROM system WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`,
      [ws.rows[0].id],
    );
    const kp = await client.query(
      `SELECT id FROM knowledge_page WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`,
      [ws.rows[0].id],
    );
    const wp = await client.query(
      `SELECT route_key FROM wiki_page_index
       WHERE workspace_id = $1
         AND published_status = 'published'
         AND route_key ~ '^[-a-zA-Z0-9/_]+$'
       ORDER BY route_key LIMIT 1`,
      [ws.rows[0].id],
    );
    return {
      workspaceId: ws.rows[0].id,
      userId: u.rows[0].id,
      employeeId: u.rows[0].employee_id,
      name: u.rows[0].name,
      email: u.rows[0].email,
      projectId: proj.rows[0]?.id ?? null,
      systemId: sys.rows[0]?.id ?? null,
      knowledgePageId: kp.rows[0]?.id ?? null,
      wikiPath: wp.rows[0]?.route_key ?? null,
    };
  } finally {
    await client.end();
  }
}

async function createSharedSession(ids: SeedIds): Promise<string> {
  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL * 1000;
  const sessionObj = {
    id: sessionId,
    userId: ids.userId,
    workspaceId: ids.workspaceId,
    employeeId: ids.employeeId,
    name: ids.name,
    email: ids.email,
    roles: ['ADMIN'],
    permissions: [...(ROLE_PERMISSIONS['ADMIN'] ?? [])],
    orgId: undefined,
    createdAt: now,
    expiresAt,
  };

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO user_session (id, data, expires_at) VALUES ($1, $2::jsonb, to_timestamp($3 / 1000.0))
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
      [sessionId, JSON.stringify(sessionObj), expiresAt],
    );
  } finally {
    await client.end();
  }

  const redis = new Redis(REDIS_URL);
  try {
    await redis.setex(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL, JSON.stringify(sessionObj));
  } finally {
    await redis.quit();
  }

  return sessionId;
}

async function setSessionCookie(page: Page, sessionId: string): Promise<void> {
  await page.context().addCookies([
    {
      name: 'sessionId',
      value: sessionId,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

type Shot = {
  name: string;
  url: (ids: SeedIds) => string;
  needsLogin: boolean;
  skipIf?: (ids: SeedIds) => boolean;
};

const SHOTS: Shot[] = [
  { name: 'auth-01-login', url: () => '/login', needsLogin: false },

  { name: 'dashboard-01', url: () => '/dashboard', needsLogin: true },
  { name: 'ask-01-home', url: () => '/ask', needsLogin: true },
  { name: 'search-01', url: () => '/search?q=onboarding', needsLogin: true },
  { name: 'profile-01', url: () => '/profile', needsLogin: true },
  { name: 'architecture-01', url: () => '/architecture', needsLogin: true },
  { name: 'infra-01', url: () => '/infra', needsLogin: true },
  { name: 'infra-02-import', url: () => '/infra/import', needsLogin: true },

  { name: 'wiki-01-home', url: () => '/wiki', needsLogin: true },
  { name: 'wiki-02-graph', url: () => '/wiki/graph', needsLogin: true },
  { name: 'wiki-03-ingest-manual', url: () => '/wiki/ingest/manual', needsLogin: true },
  {
    name: 'wiki-04-page-detail',
    url: (ids) => `/wiki/${ids.workspaceId}/${ids.wikiPath}`,
    needsLogin: true,
    skipIf: (ids) => !ids.wikiPath,
  },

  { name: 'knowledge-01-list', url: () => '/knowledge', needsLogin: true },
  { name: 'knowledge-02-new', url: () => '/knowledge/new', needsLogin: true },
  { name: 'knowledge-03-faq', url: () => '/knowledge/faq', needsLogin: true },
  { name: 'knowledge-04-glossary', url: () => '/knowledge/glossary', needsLogin: true },
  { name: 'knowledge-05-hr', url: () => '/knowledge/hr', needsLogin: true },
  { name: 'knowledge-06-onboarding', url: () => '/knowledge/onboarding', needsLogin: true },
  { name: 'knowledge-07-tools', url: () => '/knowledge/tools', needsLogin: true },
  {
    name: 'knowledge-08-detail',
    url: (ids) => `/knowledge/${ids.knowledgePageId}`,
    needsLogin: true,
    skipIf: (ids) => !ids.knowledgePageId,
  },
  {
    name: 'knowledge-09-edit',
    url: (ids) => `/knowledge/${ids.knowledgePageId}/edit`,
    needsLogin: true,
    skipIf: (ids) => !ids.knowledgePageId,
  },
  {
    name: 'knowledge-10-history',
    url: (ids) => `/knowledge/${ids.knowledgePageId}/history`,
    needsLogin: true,
    skipIf: (ids) => !ids.knowledgePageId,
  },
  {
    name: 'knowledge-11-review',
    url: (ids) => `/knowledge/${ids.knowledgePageId}/review`,
    needsLogin: true,
    skipIf: (ids) => !ids.knowledgePageId,
  },

  { name: 'notices-01-list', url: () => '/notices', needsLogin: true },
  { name: 'notices-02-new', url: () => '/notices/new', needsLogin: true },

  { name: 'projects-01-list', url: () => '/projects', needsLogin: true },
  { name: 'projects-02-new', url: () => '/projects/new', needsLogin: true },
  {
    name: 'projects-03-detail',
    url: (ids) => `/projects/${ids.projectId}`,
    needsLogin: true,
    skipIf: (ids) => !ids.projectId,
  },
  {
    name: 'projects-04-tasks',
    url: (ids) => `/projects/${ids.projectId}/tasks`,
    needsLogin: true,
    skipIf: (ids) => !ids.projectId,
  },
  {
    name: 'projects-05-inquiries',
    url: (ids) => `/projects/${ids.projectId}/inquiries`,
    needsLogin: true,
    skipIf: (ids) => !ids.projectId,
  },
  {
    name: 'projects-06-staff',
    url: (ids) => `/projects/${ids.projectId}/staff`,
    needsLogin: true,
    skipIf: (ids) => !ids.projectId,
  },
  {
    name: 'projects-07-settings',
    url: (ids) => `/projects/${ids.projectId}/settings`,
    needsLogin: true,
    skipIf: (ids) => !ids.projectId,
  },

  { name: 'attendance-01', url: () => '/attendance', needsLogin: true },
  { name: 'attendance-02-out-manage', url: () => '/attendance/out-manage', needsLogin: true },

  { name: 'admin-01-audit', url: () => '/admin/audit', needsLogin: true },
  { name: 'admin-02-codes', url: () => '/admin/codes', needsLogin: true },
  { name: 'admin-03-companies', url: () => '/admin/companies', needsLogin: true },
  { name: 'admin-04-llm-cost', url: () => '/admin/llm-cost', needsLogin: true },
  { name: 'admin-05-menus', url: () => '/admin/menus', needsLogin: true },
  { name: 'admin-06-observability-wiki', url: () => '/admin/observability/wiki', needsLogin: true },
  { name: 'admin-07-organizations', url: () => '/admin/organizations', needsLogin: true },
  { name: 'admin-08-review-queue', url: () => '/admin/review-queue', needsLogin: true },
  { name: 'admin-09-search-analytics', url: () => '/admin/search-analytics', needsLogin: true },
  { name: 'admin-10-settings', url: () => '/admin/settings', needsLogin: true },
  { name: 'admin-11-users', url: () => '/admin/users', needsLogin: true },
  { name: 'admin-12-wiki-boundary-violations', url: () => '/admin/wiki/boundary-violations', needsLogin: true },
  { name: 'admin-13-wiki-review-queue', url: () => '/admin/wiki/review-queue', needsLogin: true },
];

test.describe('design screenshots (full)', () => {
  let seedIds: SeedIds;
  let sharedSessionId: string;

  test.beforeAll(async () => {
    seedIds = await loadSeedIds();
    sharedSessionId = await createSharedSession(seedIds);
  });

  for (const shot of SHOTS) {
    test(shot.name, async ({ page }) => {
      test.setTimeout(60000);
      if (shot.skipIf && shot.skipIf(seedIds)) {
        test.skip(true, `no seed data for ${shot.name}`);
        return;
      }
      if (shot.needsLogin) {
        await setSessionCookie(page, sharedSessionId);
      }
      const url = shot.url(seedIds);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // pages with SSE/long-polling never reach networkidle — proceed
      }
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: path.join(OUT_DIR, `${shot.name}.png`),
        fullPage: true,
        timeout: 15000,
      });
      expect(true).toBe(true);
    });
  }
});
