import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auditRscBoundary", () => {
  it("flags client files that import server-only modules and ignores generated directories", async () => {
    // @ts-expect-error runtime .mjs guard is validated by this test
    const { auditRscBoundary } = await import("./audit-rsc-boundary.mjs");
    const root = await mkdtemp(join(tmpdir(), "jarvis-rsc-"));
    await mkdir(join(root, "apps/web/components"), { recursive: true });
    await writeFile(
      join(root, "apps/web/components/client.tsx"),
      '"use client";\nimport { readFileSync } from "node:fs";\nexport const x = readFileSync;\n'
    );
    await mkdir(join(root, ".turbo"), { recursive: true });
    await writeFile(
      join(root, ".turbo/generated.tsx"),
      '"use client";\nimport { readFileSync } from "node:fs";\nexport const y = readFileSync;\n'
    );

    const report = await auditRscBoundary(root);
    expect(report.violations).toHaveLength(1);
  });
});
