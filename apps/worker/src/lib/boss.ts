import PgBoss from "pg-boss";

function requireDatabaseUrl(env: Record<string, string | undefined>): string {
  const value = env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

export function createBoss(
  env: Record<string, string | undefined> = process.env,
): PgBoss {
  const boss = new PgBoss({
    connectionString: requireDatabaseUrl(env),
    retryLimit: 3,
    retryDelay: 30,
  });
  boss.on("error", (error) => {
    console.error("[pg-boss]", {
      name: error.name,
      message: error.message.slice(0, 2_000),
    });
  });
  return boss;
}
