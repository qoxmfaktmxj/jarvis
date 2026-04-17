#!/usr/bin/env node
// Phase-W5 T3: one-shot / cron-friendly ingest that keeps
// knowledge_page.embedding in sync with title+summary content.
//
// Usage:
//   OPENAI_API_KEY=... pnpm exec node scripts/embed-knowledge-pages.mjs
//
// Behaviour:
//   - Selects every page where embedding IS NULL OR last_embedded_at < updated_at
//   - For each page, embeds `${title}\n${summary ?? ''}` with text-embedding-3-small
//   - UPDATEs embedding + last_embedded_at = now()
//   - Exits 0 on success, 1 on any failure.
//
// `sql` (the drizzle-orm tagged template) is injected so the core function is
// unit-testable from the repo root without needing to resolve drizzle-orm there.

const BATCH_SIZE = 20;

export async function embedPages({ db, openai, sql }) {
  const { rows } = await db.execute(sql`
    SELECT id, title, coalesce(summary, '') AS summary
    FROM knowledge_page
    WHERE publish_status != 'deleted'
      AND (embedding IS NULL OR last_embedded_at IS NULL OR last_embedded_at < updated_at)
    ORDER BY updated_at DESC
    LIMIT ${BATCH_SIZE}
  `);

  for (const row of rows) {
    const input = `${row.title}\n${row.summary}`.trim();
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input,
    });
    const vec = res.data[0].embedding;
    const literal = `[${vec.join(',')}]`;
    await db.execute(sql`
      UPDATE knowledge_page
      SET embedding = ${literal}::vector,
          last_embedded_at = now()
      WHERE id = ${row.id}::uuid
    `);
  }
  return rows.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../packages/db/src/client.js');
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let total = 0;
  while (true) {
    const n = await embedPages({ db, openai, sql });
    total += n;
    if (n < BATCH_SIZE) break;
  }
  console.log(`embedded ${total} pages`);
  process.exit(0);
}
