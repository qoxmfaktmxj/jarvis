import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // sentry.test.ts가 vi.resetModules() + await import() 조합을 사용해
    // turbo 병렬 실행 시 CPU 경합으로 Vitest 기본 5s timeout을 초과한다.
    // singleThread: true — shared 패키지 테스트를 단일 worker에서 직렬 실행해
    // transform 캐시를 공유하고, testTimeout을 넉넉히 설정해 안정화한다.
    testTimeout: 20000,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
