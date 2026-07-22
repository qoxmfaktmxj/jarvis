import { access, constants } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { initWiki, syncWikiSamples } from "../init-wiki.js";

const accessAsync = promisify(access);

async function pathExists(path: string) {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("initWiki", () => {
  it("copies sample wiki into an empty runtime tree without creating .git", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-init-wiki-"));
    const samplesRoot = join(sandbox, "samples", "wiki");
    const runtimeRoot = join(sandbox, ".runtime", "wiki-repo");

    await mkdir(join(samplesRoot, "auto", "concepts"), { recursive: true });
    await writeFile(join(samplesRoot, "auto", "concepts", "average-wage.md"), "# 평균임금\n");
    await mkdir(join(samplesRoot, "manual", "notes"), { recursive: true });
    await writeFile(join(samplesRoot, "manual", "notes", "demo-guidance.md"), "# 가이드\n");

    await initWiki({ samplesRoot, runtimeRoot });

    expect(await pathExists(join(runtimeRoot, "auto", "concepts", "average-wage.md"))).toBe(true);
    expect(await pathExists(join(runtimeRoot, ".git"))).toBe(false);
  });

  it("rejects non-empty targets and overwrite attempts", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-init-wiki-occupied-"));
    const samplesRoot = join(sandbox, "samples", "wiki");
    const runtimeRoot = join(sandbox, ".runtime", "wiki-repo");
    await mkdir(join(samplesRoot, "auto", "concepts"), { recursive: true });
    await writeFile(join(samplesRoot, "auto", "concepts", "average-wage.md"), "# 평균임금\n");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(join(runtimeRoot, "sentinel.txt"), "occupied");

    await expect(initWiki({ samplesRoot, runtimeRoot })).rejects.toThrow(/non-empty|overwrite|symlink/i);
  });

  it("hydrates only declared synthetic source revision placeholders", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-init-wiki-hydrate-"));
    const samplesRoot = join(sandbox, "samples", "wiki");
    const runtimeRoot = join(sandbox, ".runtime", "wiki-repo");
    const revisionId = "550e8400-e29b-41d4-a716-446655440000";
    await mkdir(join(samplesRoot, "auto", "concepts"), { recursive: true });
    await writeFile(
      join(samplesRoot, "auto", "concepts", "average-wage.md"),
      "sourceRevisionId: {{sourceRevisionId:average-wage.json}}\n",
    );

    await initWiki({
      samplesRoot,
      runtimeRoot,
      sourceRevisionIds: { "average-wage.json": revisionId },
    });

    await expect(
      readFile(join(runtimeRoot, "auto", "concepts", "average-wage.md"), "utf8"),
    ).resolves.toContain(`sourceRevisionId: ${revisionId}`);
  });

  it("rejects an undeclared source revision placeholder", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-init-wiki-unknown-"));
    const samplesRoot = join(sandbox, "samples", "wiki");
    const runtimeRoot = join(sandbox, ".runtime", "wiki-repo");
    await mkdir(join(samplesRoot, "auto", "concepts"), { recursive: true });
    await writeFile(
      join(samplesRoot, "auto", "concepts", "unknown.md"),
      "sourceRevisionId: {{sourceRevisionId:unknown.json}}\n",
    );

    await expect(initWiki({
      samplesRoot,
      runtimeRoot,
      sourceRevisionIds: {},
    })).rejects.toThrow(/placeholder|revision/i);
  });

  it("upserts bundled sample pages into an existing runtime without touching user pages", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-sync-wiki-"));
    const samplesRoot = join(sandbox, "samples", "wiki");
    const runtimeRoot = join(sandbox, ".runtime", "wiki-repo");
    await mkdir(join(samplesRoot, "manual", "notes"), { recursive: true });
    await writeFile(
      join(samplesRoot, "manual", "notes", "withholding.md"),
      "sourceRevisionId: {{sourceRevisionId:withholding.json}}\n",
    );
    await mkdir(join(runtimeRoot, "manual", "notes"), { recursive: true });
    await writeFile(join(runtimeRoot, "manual", "notes", "user-note.md"), "사용자 문서\n");

    await syncWikiSamples({
      samplesRoot,
      runtimeRoot,
      sourceRevisionIds: { "withholding.json": "550e8400-e29b-41d4-a716-446655440000" },
    });

    await expect(readFile(join(runtimeRoot, "manual", "notes", "user-note.md"), "utf8"))
      .resolves.toBe("사용자 문서\n");
    await expect(readFile(join(runtimeRoot, "manual", "notes", "withholding.md"), "utf8"))
      .resolves.toContain("550e8400-e29b-41d4-a716-446655440000");
  });
});
