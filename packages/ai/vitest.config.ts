import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "__tests__/**/*.test.ts"],
    // 실제 OpenAI API 호출 / Postgres 연결이 필요한 테스트는 default `pnpm test`
    // 에서 제외. CI에서 DATABASE_URL + OPENAI_API_KEY가 설정된 상태로 별도
    // `test:integration` 스크립트로 실행. (로컬 개발자는 docker compose up
    // 후 수동으로 돌릴 수 있음.)
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.integration.test.ts",
      "**/ask.test.ts",
      "**/embed.test.ts",
      "**/graph-context.test.ts",
      "**/ask-cache.test.ts",
    ],
    // turbo 병렬 실행 시 프로세스 부하로 기본 5s timeout이 자주 초과됨.
    testTimeout: 20000,
    hookTimeout: 15000,
  },
});
