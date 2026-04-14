import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

/**
 * packages/db/schema/document-chunks.ts
 *
 * Phase-7A PR#7 — document_chunks 테이블 (write path flag off)
 *
 * - OpenAI 1536d 임베딩을 담는 Lane A 본체.
 * - precedent_case(Lane B, TF-IDF+SVD 1536d)와는 **절대 같은 인덱스/UNION 금지**.
 *   (자세한 경고는 packages/search/README.md 참조)
 * - 7A에서는 DDL만 존재. 실제 write는 packages/db/writers/document-chunks.ts의
 *   FEATURE_DOCUMENT_CHUNKS_WRITE 플래그 뒤에서만 열린다.
 */

const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1536)",
  fromDriver: (value: string) => value.slice(1, -1).split(",").map(Number),
  toDriver: (value: number[]) => `[${value.join(",")}]`
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    documentId: uuid("document_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding"),
    tokens: integer("tokens").notNull(),
    sensitivity: varchar("sensitivity", { length: 30 })
      .default("INTERNAL")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (t) => ({
    docChunkUniq: uniqueIndex("document_chunks_doc_chunk_uniq").on(
      t.documentType,
      t.documentId,
      t.chunkIndex
    ),
    docIdx: index("document_chunks_doc_idx").on(t.documentType, t.documentId),
    hashIdx: index("document_chunks_hash_idx").on(t.contentHash),
    wsIdx: index("document_chunks_ws_idx").on(t.workspaceId)
  })
);

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
