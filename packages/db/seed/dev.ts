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
const { menuItem } = await import('../schema/menu.js');

async function seed() {
  console.log('[seed] Starting dev seed...');

  // ---- Workspace ----
  const [ws] = await db
    .insert(workspace)
    .values({ code: 'default', name: 'Default Workspace' })
    .onConflictDoNothing()
    .returning();

  let wsId: string;
  if (ws) {
    wsId = ws.id;
    console.log(`[seed] Created workspace: ${wsId}`);
  } else {
    // Already exists — fetch id and run company seed only (other seeds are not idempotent)
    const [existing] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.code, 'default'))
      .limit(1);
    if (!existing) throw new Error('[seed] workspace not created and not found');
    wsId = existing.id;
    console.log(`[seed] Using existing workspace: ${wsId}`);
    const { seedCodeGroups } = await import('./code-groups.js');
    await seedCodeGroups(wsId);
    const { seedCompaniesFromTsmt001 } = await import('./companies-tsmt001.js');
    await seedCompaniesFromTsmt001(wsId);
    console.log('[seed] Dev seed complete (codes + companies only — workspace already existed)');
    return;
  }

  // ---- Users ----
  const users = await db
    .insert(user)
    .values([
      { workspaceId: wsId, employeeId: 'EMP001', email: 'admin@jarvis.dev', name: 'Admin User' },
      { workspaceId: wsId, employeeId: 'EMP002', email: 'alice@jarvis.dev', name: 'Alice Kim' },
      { workspaceId: wsId, employeeId: 'EMP003', email: 'bob@jarvis.dev', name: 'Bob Lee' },
    ])
    .returning();

  console.log(`[seed] Created ${users.length} users`);
  const [adminUser, aliceUser, bobUser] = users as [typeof users[0], typeof users[0], typeof users[0]];

  // ---- Roles ----
  const roles = await db
    .insert(role)
    .values([
      { workspaceId: wsId, code: 'ADMIN', name: 'Admin' },
      { workspaceId: wsId, code: 'MANAGER', name: 'Manager' },
      { workspaceId: wsId, code: 'VIEWER', name: 'Viewer' },
      { workspaceId: wsId, code: 'DEVELOPER', name: 'Developer' },
      { workspaceId: wsId, code: 'HR', name: 'HR' },
    ])
    .returning();

  console.log(`[seed] Created ${roles.length} roles`);
  const [adminRole, managerRole, viewerRole] = roles as [typeof roles[0], typeof roles[0], typeof roles[0]];

  // Assign roles
  await db.insert(userRole).values([
    { userId: adminUser.id, roleId: adminRole.id },
    { userId: aliceUser.id, roleId: managerRole.id },
    { userId: bobUser.id, roleId: viewerRole.id },
  ]);

  // NOTE: 'project' table (formerly 'system') now requires company_id NOT NULL.
  // Dev seed skips project/projectAccess insertion — company must be created first.
  // P2-A seed update will add proper project seeding with company data.
  console.log('[seed] Skipping project seed (company_id required — P2-A will add)');
  void projectAccess; // keep import for type-check pass

  // ---- Knowledge Pages ----
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

  // ---- Menu Items ----
  // RBAC menu tree (Phase: rbac-menu-tree, Task 1/9): code is now NOT NULL.
  // Final menu seed will be replaced by Task 2's RBAC bootstrap. These rows are
  // kept minimal so dev seed continues to pass type-check.
  await db.insert(menuItem).values([
    { workspaceId: wsId, code: 'dashboard',  label: 'Dashboard', routePath: '/dashboard', icon: 'LayoutDashboard', sortOrder: 1 },
    { workspaceId: wsId, code: 'systems',    label: 'Systems',   routePath: '/systems',   icon: 'Server',          sortOrder: 3 },
    { workspaceId: wsId, code: 'knowledge',  label: 'Knowledge', routePath: '/knowledge', icon: 'BookOpen',        sortOrder: 4 },
    { workspaceId: wsId, code: 'ask',        label: 'Ask AI',    routePath: '/ask',       icon: 'Sparkles',        sortOrder: 5 },
  ]);

  console.log('[seed] Created menu items');

  // ---- Code Groups (C10100, C10005, C10002) ----
  const { seedCodeGroups } = await import('./code-groups.js');
  await seedCodeGroups(wsId);

  // ---- Companies (TSMT001) ----
  const { seedCompaniesFromTsmt001 } = await import('./companies-tsmt001.js');
  await seedCompaniesFromTsmt001(wsId);

  console.log('[seed] Dev seed complete!');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  });
