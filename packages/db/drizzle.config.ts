import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export default defineConfig({
  schema: "./schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://jarvis:jarvispass@localhost:5432/jarvis"
  },
  // Phase-W4: document_chunks 테이블은 schema/index.ts에서 제거됨 (W3 완료).
  // 실제 DROP TABLE은 0019_absurd_scarlet_witch.sql에서 이미 실행됨.
  // 이 tablesFilter는 이후 db:generate가 해당 테이블을 다시 추적해 중복 DROP을
  // 생성하지 않도록 막는 안전장치. 테이블이 확실히 없어진 후에는 이 옵션 제거 가능.
  tablesFilter: ["!document_chunks"],
  verbose: true,
  strict: true
});
