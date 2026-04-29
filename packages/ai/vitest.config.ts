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
    // singleThread 모드에서 첫 번째 파일의 첫 import는 ESM resolution 비용이
    // 그대로 발생하며, CPU 경합 시 ~20s를 초과할 수 있다. 60s로 안전 마진 확보.
    testTimeout: 60000,
    hookTimeout: 15000,
    // budget/logger/wiki-ops-budget 테스트가 vi.mock("@jarvis/db/client") +
    // await import() 조합을 사용하는데, Vitest ESM transform이 첫 import 시
    // ~8-9s 소요된다. turbo 병렬(다른 패키지 동시 실행)로 CPU 경합이 생기면
    // 이 지연이 20s timeout을 초과해 flaky fail이 발생한다.
    //
    // singleThread: true — AI 패키지 내 테스트 파일들을 단일 worker thread에서
    // 직렬 실행하여 transform 캐시를 공유한다. 첫 import 비용이 파일당 1회로
    // 줄어들고, vi.resetModules() 후 re-import도 캐시를 재사용해 빠르다.
    // turbo 병렬(다른 패키지와의 병렬)은 유지된다.
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
