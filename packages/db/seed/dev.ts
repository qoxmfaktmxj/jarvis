import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env') });
loadEnv();

const { db } = await import('../client.js');
const { eq } = await import('drizzle-orm');
const { workspace, organization } = await import('../schema/tenant.js');
const { user, role, userRole } = await import('../schema/user.js');
const { projectAccess } = await import('../schema/project.js');
const { knowledgePage, knowledgePageVersion, knowledgeClaim } = await import('../schema/knowledge.js');

async function seed() {
  console.log('[seed] Starting dev seed...');

  // ---- Workspace ----
  // Canonical workspace code is 'jarvis' (matches e2e fixtures and existing DB).
  const [ws] = await db
    .insert(workspace)
    .values({ code: 'jarvis', name: 'Jarvis Workspace' })
    .onConflictDoNothing()
    .returning();

  let wsId: string;
  let isFirstRun: boolean;
  if (ws) {
    wsId = ws.id;
    isFirstRun = true;
    console.log(`[seed] Created workspace: ${wsId}`);
  } else {
    // Workspace already exists — only idempotent seeds run from here on
    const [existing] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.code, 'jarvis'))
      .limit(1);
    if (!existing) throw new Error('[seed] workspace not created and not found');
    wsId = existing.id;
    isFirstRun = false;
    console.log(`[seed] Using existing workspace: ${wsId}`);
    const { seedCodeGroups } = await import('./code-groups.js');
    await seedCodeGroups(wsId);
    const { seedCompaniesFromTsmt001 } = await import('./companies-tsmt001.js');
    await seedCompaniesFromTsmt001(wsId);
    const { seedUsersFromTsys305 } = await import('./users-tsys305.js');
    await seedUsersFromTsys305(wsId);
    const { seedSalesCodes } = await import('./sales-codes.js');
    await seedSalesCodes(wsId);
    const { seedSalesStatsCodes } = await import('./sales-stats-codes.js');
    await seedSalesStatsCodes(wsId);
    // Re-seed menus + permissions so menu_item changes (badge / keywords /
    // route / sortOrder / label) flow through `pnpm db:seed` idempotently
    // against existing workspaces. seedPermissions is itself idempotent
    // (onConflictDoNothing on (resource, action)) and returns the
    // key->id map needed to wire menu_permission links.
    const { seedPermissions } = await import('./permissions.js');
    const { seedMenuTree } = await import('./menus.js');
    const permKeyToId = await seedPermissions();
    await seedMenuTree(wsId, permKeyToId);
    console.log('[seed] Dev seed complete (codes + companies + sales + menus)');
    return;
  }

  // ---- Users (only on first run — schema/DB drift on user table prevents
  // ORM inserts on existing DBs; users are bootstrapped once when workspace
  // is freshly created). Subsequent runs assume users already exist and
  // re-fetch them by employee_id.
  if (isFirstRun) {
    await db.insert(user).values([
      { workspaceId: wsId, employeeId: 'EMP001', email: 'admin@jarvis.dev', name: 'Admin User' },
      { workspaceId: wsId, employeeId: 'EMP002', email: 'alice@jarvis.dev', name: 'Alice Kim' },
      { workspaceId: wsId, employeeId: 'EMP003', email: 'bob@jarvis.dev', name: 'Bob Lee' },
    ]);
  }

  // Re-fetch by id/employee_id only — projecting all columns hits drift on
  // pre-existing DBs (legacy `user` table predates schema/migrations 0033+).
  const users = await db
    .select({ id: user.id, employeeId: user.employeeId })
    .from(user)
    .where(eq(user.workspaceId, wsId));
  console.log(`[seed] Have ${users.length} users in workspace ${wsId}`);

  const adminUser = users.find((u) => u.employeeId === 'EMP001');
  const aliceUser = users.find((u) => u.employeeId === 'EMP002');
  const bobUser   = users.find((u) => u.employeeId === 'EMP003');
  if (!adminUser || !aliceUser || !bobUser) {
    throw new Error('[seed] dev users missing — expected EMP001/EMP002/EMP003 in workspace');
  }

  // ---- Roles (idempotent on (workspace_id, code) — index 0049) ----
  await db
    .insert(role)
    .values([
      { workspaceId: wsId, code: 'ADMIN', name: 'Admin' },
      { workspaceId: wsId, code: 'MANAGER', name: 'Manager' },
      { workspaceId: wsId, code: 'VIEWER', name: 'Viewer' },
      { workspaceId: wsId, code: 'DEVELOPER', name: 'Developer' },
      { workspaceId: wsId, code: 'HR', name: 'HR' },
    ])
    .onConflictDoNothing({ target: [role.workspaceId, role.code] });

  const allRoles = await db
    .select()
    .from(role)
    .where(eq(role.workspaceId, wsId));
  console.log(`[seed] Have ${allRoles.length} roles (insert + re-fetch)`);

  const adminRole   = allRoles.find((r) => r.code === 'ADMIN');
  const managerRole = allRoles.find((r) => r.code === 'MANAGER');
  const viewerRole  = allRoles.find((r) => r.code === 'VIEWER');
  if (!adminRole || !managerRole || !viewerRole) {
    throw new Error('[seed] expected roles missing after upsert (ADMIN/MANAGER/VIEWER)');
  }

  // Assign roles (idempotent — user_role PK is (user_id, role_id))
  await db
    .insert(userRole)
    .values([
      { userId: adminUser.id, roleId: adminRole.id },
      { userId: aliceUser.id, roleId: managerRole.id },
      { userId: bobUser.id, roleId: viewerRole.id },
    ])
    .onConflictDoNothing();

  // NOTE: 'project' table (formerly 'system') now requires company_id NOT NULL.
  // Dev seed skips project/projectAccess insertion — company must be created first.
  // P2-A seed update will add proper project seeding with company data.
  console.log('[seed] Skipping project seed (company_id required — P2-A will add)');
  void projectAccess; // keep import for type-check pass

  // ---- Knowledge Pages (NOT idempotent — only on first run) ----
  if (isFirstRun) {
    const knowledgeData = [
      {
        title: 'Employee Onboarding Guide',
        pageType: 'onboarding' as const,
        mdx: '# Employee Onboarding Guide\n\nWelcome to Jarvis! This guide walks you through your first week.\n\n## Day 1\n\nSet up your workstation and review the company handbook.\n\n## Day 2-5\n\nMeet your team, complete compliance training, and get access to all required systems.',
      },
      {
        title: 'HR Policies Overview',
        pageType: 'hr-policy' as const,
        mdx: '# HR Policies\n\n## Leave Policy\n\nAll full-time employees receive 20 days of paid annual leave.\n\n## Remote Work\n\nRemote work is allowed up to 3 days per week with manager approval.',
      },
      {
        title: 'Development Tools & Setup',
        pageType: 'tool-guide' as const,
        mdx: '# Development Tools\n\n## Required Software\n\n- Node.js 22\n- pnpm 9\n- Docker Desktop\n- VS Code or Cursor\n\n## Repository Access\n\nRequest access to the jarvis GitHub org from your manager.',
      },
      {
        title: 'FAQ: Common Questions',
        pageType: 'faq' as const,
        mdx: '# Frequently Asked Questions\n\n## How do I reset my password?\n\nVisit /auth/reset and follow the instructions.\n\n## Who do I contact for IT support?\n\nEmail it@jarvis.dev or open a ticket in the portal.',
      },
      {
        title: 'Glossary of Terms',
        pageType: 'glossary' as const,
        mdx: '# Glossary\n\n**RAG** — Retrieval-Augmented Generation. AI technique combining search with LLM generation.\n\n**pgvector** — PostgreSQL extension for vector similarity search.\n\n**MDX** — Markdown with JSX components embedded.',
      },
    ];

    for (const kd of knowledgeData) {
      const [kp] = await db
        .insert(knowledgePage)
        .values({
          workspaceId: wsId,
          pageType: kd.pageType,
          title: kd.title,
          slug: kd.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          publishStatus: 'published',
          createdBy: adminUser.id,
        })
        .returning();

      if (!kp) continue;

      await db.insert(knowledgePageVersion).values({
        pageId: kp.id,
        versionNumber: 1,
        title: kd.title,
        mdxContent: kd.mdx,
        authorId: adminUser.id,
      });

      // Insert a sample claim. Phase-Harness (2026-04-23): embedding 컬럼 제거됨.
      await db.insert(knowledgeClaim).values({
        pageId: kp.id,
        chunkIndex: 0,
        claimText: kd.mdx.slice(0, 200),
      });
    }

    console.log(`[seed] Created ${knowledgeData.length} knowledge pages with versions and claims`);
  } else {
    console.log('[seed] Skipping knowledge pages (not idempotent — already seeded on first run)');
  }

  // ---- RBAC: permission, role_permission, menu_item, menu_permission ----
  // (rbac-menu-tree Task 2/9). Replaces the legacy 4-row menu placeholder.
  const { seedPermissions, seedRolePermissions } = await import('./permissions.js');
  const { seedMenuTree } = await import('./menus.js');
  const permKeyToId = await seedPermissions();
  await seedRolePermissions(wsId, permKeyToId);
  await seedMenuTree(wsId, permKeyToId);

  // ---- Code Groups (C10100, C10005, C10002) ----
  const { seedCodeGroups } = await import('./code-groups.js');
  await seedCodeGroups(wsId);

  // ---- Companies (TSMT001) ----
  const { seedCompaniesFromTsmt001 } = await import('./companies-tsmt001.js');
  await seedCompaniesFromTsmt001(wsId);

  // ---- Users (TSYS305) ----
  const { seedUsersFromTsys305 } = await import('./users-tsys305.js');
  await seedUsersFromTsys305(wsId);

  // ---- Sales Code Groups (영업관리모듈 Phase 1) ----
  const { seedSalesCodes } = await import('./sales-codes.js');
  await seedSalesCodes(wsId);

  // ---- Sales Stats Code Groups (Group 6 Statistics — B30010/B30030/B10026/B10027) ----
  const { seedSalesStatsCodes } = await import('./sales-stats-codes.js');
  await seedSalesStatsCodes(wsId);

  console.log('[seed] Dev seed complete!');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  });
