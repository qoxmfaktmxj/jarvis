import "dotenv/config";
import PgBoss from "pg-boss";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://jarvis:jarvispass@localhost:5432/jarvis";

async function main() {
  console.log("[worker] Starting Jarvis worker...");

  const boss = new PgBoss({
    connectionString: DATABASE_URL,
    retryLimit: 3,
    retryDelay: 60,
    expireInHours: 24,
    archiveCompletedAfterSeconds: 86400
  });

  boss.on("error", (error) => console.error("[worker] pg-boss error:", error));
  await boss.start();
  console.log("[worker] pg-boss started");

  await boss.work("ping", async (job: { data?: unknown } | { data?: unknown }[]) => {
    const payload = Array.isArray(job) ? job.map((item) => item.data) : job.data;
    console.log("[worker] ping received:", payload);
    return { pong: true };
  });

  await boss.schedule("check-freshness", "0 9 * * *", {});

  console.log("[worker] Ready. Listening for jobs...");

  const shutdown = async () => {
    console.log("[worker] Shutting down...");
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[worker] Fatal error:", error);
  process.exit(1);
});
