import 'dotenv/config';
import { db } from '../client.js';
import { workspace, organization } from '../schema/tenant.js';
import { user, role, userRole } from '../schema/user.js';
import { project, projectTask } from '../schema/project.js';
import { system, systemAccess } from '../schema/system.js';
import { knowledgePage, knowledgePageVersion, knowledgeClaim } from '../schema/knowledge.js';
import { menuItem } from '../schema/menu.js';

async function seed() {
  console.log('[seed] Starting dev seed...');

  // ---- Workspace ----
  const [ws] = await db
    .insert(workspace)
    .values({ code: 'default', name: 'Default Workspace' })
    .onConflictDoNothing()
    .returning();

  if (!ws) {
    console.log('[seed] Workspace already exists, skipping...');
    return;
  }

  const wsId = ws.id;
  console.log(`[seed] Created workspace: ${wsId}`);

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

  // ---- Projects ----
  const projects = await db
    .insert(project)
    .values([
      { workspaceId: wsId, code: 'PORTAL', name: 'Portal Rewrite', description: 'Jarvis enterprise portal v2', status: 'active', createdBy: adminUser.id },
      { workspaceId: wsId, code: 'AUTH', name: 'Auth Migration', description: 'Auth system improvements', status: 'active', createdBy: aliceUser.id },
      { workspaceId: wsId, code: 'SEARCH', name: 'Search Upgrade', description: 'Improve PostgreSQL hybrid search relevance', status: 'planning', createdBy: bobUser.id },
    ])
    .returning();

  console.log(`[seed] Created ${projects.length} projects`);

  // ---- Tasks ----
  const taskData = [
    { projectId: projects[0]!.id, title: 'Setup monorepo', status: 'done', assigneeId: adminUser.id },
    { projectId: projects[0]!.id, title: 'Implement auth', status: 'done', assigneeId: aliceUser.id },
    { projectId: projects[0]!.id, title: 'Build dashboard', status: 'in_progress', assigneeId: aliceUser.id },
    { projectId: projects[0]!.id, title: 'File upload', status: 'todo', assigneeId: bobUser.id },
    { projectId: projects[1]!.id, title: 'Login flow setup', status: 'in_progress', assigneeId: aliceUser.id },
    { projectId: projects[1]!.id, title: 'User migration script', status: 'todo', assigneeId: adminUser.id },
    { projectId: projects[2]!.id, title: 'Tune PostgreSQL ranking weights', status: 'todo', assigneeId: bobUser.id },
    { projectId: projects[2]!.id, title: 'Backfill knowledge embeddings', status: 'todo', assigneeId: bobUser.id },
    { projectId: projects[2]!.id, title: 'Expand hybrid search filters', status: 'todo', assigneeId: aliceUser.id },
    { projectId: projects[2]!.id, title: 'Polish search UI and explain mode', status: 'todo', assigneeId: bobUser.id },
  ];

  await db.insert(projectTask).values(
    taskData.map((t) => ({ ...t, workspaceId: wsId })),
  );

  console.log(`[seed] Created ${taskData.length} tasks`);

  // ---- Systems ----
  const systems = await db
    .insert(system)
    .values([
      { workspaceId: wsId, name: 'PostgreSQL', description: 'Primary database', category: 'database', status: 'healthy', ownerId: adminUser.id },
      { workspaceId: wsId, name: 'MinIO', description: 'Object storage', category: 'storage', status: 'healthy', ownerId: adminUser.id },
      { workspaceId: wsId, name: 'PostgreSQL Search', description: 'FTS + pg_trgm + pgvector hybrid search', category: 'search', status: 'healthy', ownerId: aliceUser.id },
      { workspaceId: wsId, name: 'OpenAI API', description: 'AI embeddings + chat', category: 'ai', status: 'healthy', ownerId: aliceUser.id },
    ])
    .returning();

  console.log(`[seed] Created ${systems.length} systems`);

  // System access entries (one per system for admin)
  const accessEntries = systems.flatMap((s) => [
    { workspaceId: wsId, systemId: s.id, accessType: 'web', label: 'Admin Dashboard', requiredRole: 'ADMIN', sortOrder: 1 },
  ]);

  await db.insert(systemAccess).values(accessEntries);
  console.log(`[seed] Created ${accessEntries.length} system access entries`);

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

    // Insert a sample claim (no real embedding in seed — use zeros placeholder)
    await db.insert(knowledgeClaim).values({
      pageId: kp.id,
      chunkIndex: 0,
      claimText: kd.mdx.slice(0, 200),
      embedding: new Array(1536).fill(0),
    });
  }

  console.log(`[seed] Created ${knowledgeData.length} knowledge pages with versions and claims`);

  // ---- Menu Items ----
  await db.insert(menuItem).values([
    { workspaceId: wsId, label: 'Dashboard', routePath: '/dashboard', icon: 'LayoutDashboard', sortOrder: 1 },
    { workspaceId: wsId, label: 'Projects', routePath: '/projects', icon: 'FolderKanban', sortOrder: 2 },
    { workspaceId: wsId, label: 'Systems', routePath: '/systems', icon: 'Server', sortOrder: 3 },
    { workspaceId: wsId, label: 'Knowledge', routePath: '/knowledge', icon: 'BookOpen', sortOrder: 4 },
    { workspaceId: wsId, label: 'Ask AI', routePath: '/ask', icon: 'Sparkles', sortOrder: 5 },
  ]);

  console.log('[seed] Created menu items');
  console.log('[seed] Dev seed complete!');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  });
