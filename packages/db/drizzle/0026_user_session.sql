CREATE TABLE "user_session" (
  "id" text PRIMARY KEY NOT NULL,
  "data" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX "idx_user_session_expires_at" ON "user_session" ("expires_at");
