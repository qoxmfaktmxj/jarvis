import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    // git.test / worktree.test는 실제 `git` binary 호출에 의존. Windows의
    // simple-git child process path/permission 이슈(R-W1T1-1)로 default
    // `pnpm test`에서는 제외. CI Linux matrix + Phase-W0 bootstrap의 실제
    // 사용 단계에서 `test:integration` 스크립트로 별도 검증.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/git.test.ts",
      "**/worktree.test.ts",
    ],
    testTimeout: 30_000,
  },
});
