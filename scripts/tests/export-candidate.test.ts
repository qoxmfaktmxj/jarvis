import { access, constants } from "node:fs";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { exportCandidate } from "../export-candidate.js";

const accessAsync = promisify(access);

async function pathExists(path: string) {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("exportCandidate", () => {
  it("exports only allowlisted roots and rejects symlinks or special files", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "jarvis-export-source-"));
    const targetRoot = await mkdtemp(join(tmpdir(), "jarvis-export-target-"));
    const allowlistPath = join(repoRoot, "config", "public-export-allowlist.json");

    await mkdir(join(repoRoot, "config"), { recursive: true });
    await mkdir(join(repoRoot, "apps"), { recursive: true });
    await mkdir(join(repoRoot, "packages"), { recursive: true });
    await mkdir(join(repoRoot, "samples"), { recursive: true });
    await mkdir(join(repoRoot, "scripts"), { recursive: true });
    await mkdir(join(repoRoot, ".runtime"), { recursive: true });
    await mkdir(join(repoRoot, "data"), { recursive: true });
    await writeFile(join(repoRoot, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(join(repoRoot, "apps", "placeholder.txt"), "apps");
    await writeFile(join(repoRoot, "packages", "placeholder.txt"), "packages");
    await writeFile(join(repoRoot, "samples", "placeholder.txt"), "samples");
    await writeFile(join(repoRoot, "scripts", "placeholder.txt"), "scripts");
    await writeFile(join(repoRoot, ".runtime", "state.txt"), "runtime");
    await writeFile(join(repoRoot, "data", "state.txt"), "data");
    await writeFile(
      allowlistPath,
      JSON.stringify(["apps", "packages", "samples", "scripts", "config", "package.json"])
    );

    const result = await exportCandidate({ sourceRoot: repoRoot, targetRoot, allowlistPath });

    expect(result).toEqual(
      expect.objectContaining({
        copiedRoots: expect.arrayContaining(["apps", "packages", "samples", "scripts"]),
      })
    );
    expect(await pathExists(join(targetRoot, ".runtime"))).toBe(false);
    expect(await pathExists(join(targetRoot, "data"))).toBe(false);
  });

  it("rejects symlinks inside allowlisted roots", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "jarvis-export-symlink-"));
    const targetRoot = await mkdtemp(join(tmpdir(), "jarvis-export-symlink-target-"));
    const allowlistPath = join(repoRoot, "config", "public-export-allowlist.json");

    await mkdir(join(repoRoot, "config"), { recursive: true });
    await mkdir(join(repoRoot, "samples", "real-dir"), { recursive: true });
    await writeFile(allowlistPath, JSON.stringify(["samples", "config"]));
    await writeFile(join(repoRoot, "samples", "real-dir", "real.txt"), "real");
    await symlink(
      join(repoRoot, "samples", "real-dir"),
      join(repoRoot, "samples", "linked-dir"),
      platform === "win32" ? "junction" : "dir"
    );

    await expect(
      exportCandidate({ sourceRoot: repoRoot, targetRoot, allowlistPath })
    ).rejects.toThrow(/symlink|special/i);
  });

  it("rejects nested source and target, non-empty targets, invalid allowlist entries, and generated paths", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "jarvis-export-guards-"));
    const nestedTarget = join(repoRoot, "exported");
    const siblingTarget = await mkdtemp(join(tmpdir(), "jarvis-export-guards-target-"));
    const badAllowlistPath = join(repoRoot, "config", "public-export-allowlist.json");

    await mkdir(join(repoRoot, "config"), { recursive: true });
    await mkdir(join(repoRoot, "scripts", "node_modules"), { recursive: true });
    await writeFile(join(repoRoot, "scripts", "node_modules", "leak.txt"), "leak");
    await writeFile(join(repoRoot, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(badAllowlistPath, JSON.stringify(["scripts", "scripts", "../escape", "package.json"]));

    await expect(
      exportCandidate({ sourceRoot: repoRoot, targetRoot: nestedTarget, allowlistPath: badAllowlistPath })
    ).rejects.toThrow(/nested|inside|overlap|escape/i);

    await writeFile(join(siblingTarget, "existing.txt"), "occupied");
    await expect(
      exportCandidate({ sourceRoot: repoRoot, targetRoot: siblingTarget, allowlistPath: badAllowlistPath })
    ).rejects.toThrow(/empty|escape|generated/i);

    await writeFile(
      badAllowlistPath,
      JSON.stringify(["scripts", "package.json"])
    );
    const emptyTarget = await mkdtemp(join(tmpdir(), "jarvis-export-empty-target-"));
    await expect(
      exportCandidate({ sourceRoot: repoRoot, targetRoot: emptyTarget, allowlistPath: badAllowlistPath })
    ).resolves.toMatchObject({ copiedRoots: ["scripts", "package.json"] });
    expect(await pathExists(join(emptyTarget, "scripts", "node_modules"))).toBe(false);
  });
});
