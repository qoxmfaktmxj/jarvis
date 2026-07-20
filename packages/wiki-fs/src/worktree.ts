import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { simpleGit } from "simple-git";

import { GitRepo } from "./git.js";
import type { TempWorktreeHandle } from "./types.js";

const FULL_SHA = /^[0-9a-f]{40}$/i;

export async function createTempWorktree(
  mainRepo: GitRepo,
  options: { baseSha: string },
): Promise<TempWorktreeHandle> {
  const baseSha = options.baseSha;
  if (!FULL_SHA.test(baseSha)) throw new Error("full SHA is required for a worktree base");
  const worktreePath = await mkdtemp(join(tmpdir(), "jarvis-wiki-wt-"));
  const git = simpleGit({ baseDir: mainRepo.repoPath });
  try {
    await git.raw(["worktree", "add", "--detach", worktreePath, baseSha]);
  } catch (error) {
    await rm(worktreePath, { recursive: true, force: true });
    throw error;
  }

  const repo = new GitRepo(worktreePath);
  let cleaned = false;
  return {
    repo,
    baseSha: baseSha.toLowerCase(),
    worktreePath,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await git.raw(["worktree", "remove", "--force", worktreePath]).catch(() => undefined);
      await rm(worktreePath, { recursive: true, force: true });
      await git.raw(["worktree", "prune"]).catch(() => undefined);
    },
  };
}
