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
    // budget.test / wiki-ops-budget.test / logger.test: DB mock 모듈 동적
    // import 시 Node.js 모듈 캐시 초기화로 30s+ 소요되는 known flaky.
    // 직접 실행 시 ~10s, turbo 병렬 시 최대 ~30s → 45s로 여유 확보.
    testTimeout: 45000,
    hookTimeout: 30000,
  },
});
