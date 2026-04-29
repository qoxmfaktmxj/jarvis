import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "__tests__/**/*.test.ts"],
    // *.integration.test.ts는 default `pnpm test`에서 제외.
    // CI에서 DATABASE_URL + OPENAI_API_KEY가 설정된 상태로 별도
    // `test:integration` 스크립트로 실행.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.integration.test.ts",
    ],
    // turbo 병렬 실행 시 프로세스 부하로 기본 5s timeout이 자주 초과됨.
    testTimeout: 20000,
    hookTimeout: 15000,
  },
});
