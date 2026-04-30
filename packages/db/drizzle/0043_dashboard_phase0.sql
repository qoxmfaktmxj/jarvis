-- Phase-Dashboard 0 (2026-04-30) — 외부 시그널(환율/날씨) + 위키 퀴즈 + 시즌제 토대.
-- 관련 schema: region-grid.ts, external-signal.ts, wiki-quiz.ts, quiz-season.ts.

-- 1) region_grid (기상청 격자좌표 매핑)
CREATE TABLE IF NOT EXISTS "region_grid" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sido" varchar(50) NOT NULL,
  "sigungu" varchar(50) NOT NULL,
  "dong" varchar(100),
  "nx" integer NOT NULL,
  "ny" integer NOT NULL,
  "lat" numeric(10, 6) NOT NULL,
  "lng" numeric(10, 6) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_region_grid_sido_sigungu" ON "region_grid" ("sido", "sigungu");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_region_grid_nx_ny" ON "region_grid" ("nx", "ny");
--> statement-breakpoint

-- 2) external_signal (환율/날씨 캐시) — enum + table
DO $$ BEGIN
  CREATE TYPE "external_signal_kind" AS ENUM ('fx', 'weather');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "external_signal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" "external_signal_kind" NOT NULL,
  "key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  CONSTRAINT "external_signal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_external_signal_ws_kind_key" ON "external_signal" ("workspace_id", "kind", "key");
--> statement-breakpoint

-- 3) wiki_quiz_batch (퀴즈 배치 메타) + wiki_quiz (문항) + wiki_quiz_attempt (사용자 풀이)
DO $$ BEGIN
  CREATE TYPE "quiz_difficulty" AS ENUM ('easy', 'medium', 'hard');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "quiz_generated_by" AS ENUM ('llm', 'human');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wiki_quiz_batch" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_by" "quiz_generated_by" NOT NULL,
  "count" integer NOT NULL,
  "prompt_version" varchar(32),
  CONSTRAINT "wiki_quiz_batch_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_quiz_batch_ws_gen_at" ON "wiki_quiz_batch" ("workspace_id", "generated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wiki_quiz" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "source_page_path" text NOT NULL,
  "question" text NOT NULL,
  "options" jsonb NOT NULL,
  "answer_index" integer NOT NULL,
  "explanation" text,
  "difficulty" "quiz_difficulty" NOT NULL,
  "generated_by" "quiz_generated_by" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wiki_quiz_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE cascade,
  CONSTRAINT "wiki_quiz_batch_id_wiki_quiz_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "wiki_quiz_batch"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_quiz_ws_batch" ON "wiki_quiz" ("workspace_id", "batch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_quiz_ws_difficulty" ON "wiki_quiz" ("workspace_id", "difficulty");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wiki_quiz_attempt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "quiz_id" uuid NOT NULL,
  "season_id" uuid,
  "chosen_index" integer NOT NULL,
  "correct" boolean NOT NULL,
  "answered_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "wiki_quiz_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
  CONSTRAINT "wiki_quiz_attempt_quiz_id_wiki_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "wiki_quiz"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_wiki_quiz_attempt_user_quiz" ON "wiki_quiz_attempt" ("user_id", "quiz_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wiki_quiz_attempt_user_answered" ON "wiki_quiz_attempt" ("user_id", "answered_at");
--> statement-breakpoint

-- 4) quiz_season + quiz_season_score + mascot_unlock
CREATE TABLE IF NOT EXISTS "quiz_season" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" varchar(64) NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "leaderboard_snapshot" jsonb,
  CONSTRAINT "quiz_season_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_season_ws_active" ON "quiz_season" ("workspace_id", "ended_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_season_score" (
  "season_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "org_id" uuid,
  "score" integer DEFAULT 0 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "correct" integer DEFAULT 0 NOT NULL,
  "last_answered_at" timestamp with time zone,
  CONSTRAINT "quiz_season_score_season_id_user_id_pk" PRIMARY KEY ("season_id", "user_id"),
  CONSTRAINT "quiz_season_score_season_id_quiz_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "quiz_season"("id") ON DELETE cascade,
  CONSTRAINT "quiz_season_score_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_season_score_score" ON "quiz_season_score" ("season_id", "score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_quiz_season_score_org" ON "quiz_season_score" ("season_id", "org_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mascot_unlock" (
  "user_id" uuid NOT NULL,
  "mascot_id" text NOT NULL,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "season_id" uuid,
  CONSTRAINT "mascot_unlock_user_id_mascot_id_pk" PRIMARY KEY ("user_id", "mascot_id"),
  CONSTRAINT "mascot_unlock_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
  CONSTRAINT "mascot_unlock_season_id_quiz_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "quiz_season"("id") ON DELETE set null
);
