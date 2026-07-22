import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";
import { describe, expect, it } from "vitest";
import { findForbiddenPaths } from "./verify-clean-boundary.js";

describe("findForbiddenPaths", () => {
  it("allows a root worktree pointer and the approved capybara asset", async () => {
    const root = await mkdtemp(join(tmpdir(), "jarvis-boundary-worktree-"));
    await writeFile(join(root, ".git"), "gitdir: ../.git/worktrees/example\n");
    await mkdir(join(root, "apps", "web", "public", "capybara"), { recursive: true });
    await writeFile(join(root, "apps", "web", "public", "capybara", "basic.png"), "approved asset");

    await expect(findForbiddenPaths(root)).resolves.toEqual([]);
  });

  it("ignores generated directories and flags forbidden dirs, symlinks, env files, internal metadata, and risky binaries", async () => {
    const graphOutputDir = ["graph", "ify-out"].join("");
    const internalAccountFile = `${["dev", "accounts"].join("-")}.json`;
    const internalDeskDir = `${["service", "desk"].join("-")}-cache`;
    const root = await mkdtemp(join(tmpdir(), "jarvis-boundary-"));
    await writeFile(join(root, ".env.example"), "SAFE=1\n");
    await writeFile(join(root, ".env.local"), "SECRET=1\n");
    await writeFile(join(root, ".env.production"), "SECRET=1\n");
    await mkdir(join(root, ".agents"), { recursive: true });
    await mkdir(join(root, ".claude"), { recursive: true });
    await mkdir(join(root, ".codex"), { recursive: true });
    await mkdir(join(root, ".codex-artifacts"), { recursive: true });
    await mkdir(join(root, ".omx"), { recursive: true });
    await mkdir(join(root, ".superpowers"), { recursive: true });
    await mkdir(join(root, "_workspace-old"), { recursive: true });
    await mkdir(join(root, graphOutputDir), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "config"), "[core]\n");
    await mkdir(join(root, "packages", "leaked", ".git"), { recursive: true });
    await writeFile(join(root, "packages", "leaked", ".git", "config"), "[core]\n");
    await writeFile(join(root, "packages", "leaked", ".env.local"), "SECRET=1\n");
    await mkdir(join(root, "packages", "worktree"), { recursive: true });
    await writeFile(join(root, "packages", "worktree", ".git"), "gitdir: ../../.git/worktrees/worktree\n");
    await mkdir(join(root, "packages", "db", "migrations"), { recursive: true });
    await writeFile(join(root, "packages", "db", "migrations", "0001_initial.sql"), "-- allowed migration\n");
    await mkdir(join(root, "apps", "worker", "src"), { recursive: true });
    await writeFile(join(root, "apps", "worker", "src", "job.ts"), "export {};\n");
    await writeFile(join(root, "apps", "worker", "src", "job.js"), "export {};\n");
    await mkdir(join(root, "infra", "cliproxy"), { recursive: true });
    await writeFile(join(root, "infra", "cliproxy", "compose.yaml"), "services: {}\n");
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, "node_modules", "tool.exe"), "");
    for (const ignoredDir of [".turbo", ".next", ".next-e2e", ".vite", "dist", "coverage", "test-results", "playwright-report", ".runtime", "artifacts"]) {
      await mkdir(join(root, ignoredDir, "nested"), { recursive: true });
      await writeFile(join(root, ignoredDir, "ignored.exe"), "");
      await writeFile(join(root, ignoredDir, "nested", ".env.local"), "IGNORED=1\n");
    }
    await writeFile(join(root, "tool.exe"), "");
    await writeFile(join(root, "dump.sql"), "");
    await writeFile(join(root, internalAccountFile), "{}\n");
    await mkdir(join(root, internalDeskDir), { recursive: true });
    await mkdir(join(root, "linked-target"), { recursive: true });
    await symlink(join(root, "linked-target"), join(root, "linked-dir"), platform === "win32" ? "junction" : "dir");

    const hits = await findForbiddenPaths(root);
    expect(hits).toEqual([
      "_workspace-old",
      ".agents",
      ".claude",
      ".codex",
      ".codex-artifacts",
      ".env.production",
      ".omx",
      ".superpowers",
      "apps/worker/src/job.js",
      internalAccountFile,
      "dump.sql",
      graphOutputDir,
      "linked-dir",
      "packages/leaked/.env.local",
      "packages/leaked/.git",
      "packages/worktree/.git",
      internalDeskDir,
      "tool.exe",
    ]);
  });
});
