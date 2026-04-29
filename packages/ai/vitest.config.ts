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
    // budget/logger 테스트는 @jarvis/db/client Pool 초기화(connectionTimeoutMillis:2000)
    // 대기 시간이 병렬 실행 부하에서 누적되어 약 9s 소요. 60s로 여유를 둔다.
    testTimeout: 60000,
    hookTimeout: 30000,
  },
});
