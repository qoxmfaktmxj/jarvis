CREATE TABLE "embed_cache" (
  "hash" varchar(64) PRIMARY KEY NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX "idx_embed_cache_expires_at" ON "embed_cache" ("expires_at");
