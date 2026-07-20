import { z } from "zod";
import {
  appendLogEntry,
  buildIndexMarkdown,
  type FileBlock,
} from "@jarvis/wiki-agent";
import {
  GitRepo,
  createTempWorktree,
  isProjectableWikiPath,
  parseFrontmatter,
} from "@jarvis/wiki-fs";
import { type LockedDbExecutor, withWorkspaceSingleWriter } from "../../lib/single-writer.js";

const evidenceSchema = z.object({
  sourceRevisionId: z.string().uuid(),
  locator: z.string().min(1).max(300),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confidence: z.number().min(0).max(1),
});

const generatedFrontmatterSchema = z.object({
  title: z.string().min(1).max(240),
  slug: z
    .string()
    .min(1)
    .max(240)
    .refine((value) => !/[\/\\\0]/.test(value)),
  pageType: z.enum(["source", "concept", "case", "guide", "synthesis"]),
  publishedStatus: z.enum(["draft", "published", "archived"]).default("draft"),
  sources: z.array(evidenceSchema).min(1),
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  created: z.string(),
  updated: z.string(),
});

const indexFrontmatterSchema = generatedFrontmatterSchema.pick({
  title: true,
  slug: true,
});

function validateGeneratedFiles(files: FileBlock[], sourceRevisionId: string): void {
  for (const file of files) {
    if (!isProjectableWikiPath(file.path) || !file.path.startsWith("auto/")) {
      throw new Error(`generated path is outside auto/: ${file.path}`);
    }
    const frontmatter = generatedFrontmatterSchema.parse(parseFrontmatter(file.content).data);
    if (!frontmatter.sources.some((ref) => ref.sourceRevisionId === sourceRevisionId)) {
      throw new Error(`generated page lacks current source revision: ${file.path}`);
    }
  }
}

async function pageMetadata(
  repo: GitRepo,
  baseSha: string,
  generated: ReadonlyMap<string, string>,
) {
  const paths = new Set((await repo.listTreePaths(baseSha)).filter(isProjectableWikiPath));
  for (const path of generated.keys()) paths.add(path);
  const result: Array<{ path: string; slug: string; title: string; summary: string }> = [];

  for (const path of [...paths].sort()) {
    const markdown = generated.get(path) ?? (await repo.readBlob(baseSha, path));
    const { data, body } = parseFrontmatter(markdown);
    const frontmatter = indexFrontmatterSchema.parse(data);
    result.push({
      path,
      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: body.replace(/\s+/g, " ").trim().slice(0, 240),
    });
  }

  return result;
}

export async function commitGeneratedPages(input: {
  workspaceId: string;
  workspaceCode: string;
  sourceRevisionId: string;
  files: FileBlock[];
  repo: GitRepo;
  now?: Date;
}): Promise<{ commitSha: string; affectedPaths: string[]; reused: boolean }> {
  return withWorkspaceSingleWriter(input.workspaceId, async (tx) => commitGeneratedPagesInTx(input, tx));
}

export async function commitGeneratedPagesInTx(input: {
  workspaceId: string;
  workspaceCode: string;
  sourceRevisionId: string;
  files: FileBlock[];
  repo: GitRepo;
  now?: Date;
}, _tx: LockedDbExecutor): Promise<{ commitSha: string; affectedPaths: string[]; reused: boolean }> {
  validateGeneratedFiles(input.files, input.sourceRevisionId);
  const now = input.now ?? new Date();

  const marker = `source-revision:${input.sourceRevisionId}`;
  const prior = await input.repo.hasCommitTrailer(marker);
  if (prior) {
    return { commitSha: prior.sha, affectedPaths: prior.affectedPaths, reused: true };
  }

  const baseSha = await input.repo.headSha();
  const handle = await createTempWorktree(input.repo, { baseSha });
  try {
    const generated = new Map(input.files.map((file) => [file.path, file.content] as const));
    const pages = await pageMetadata(input.repo, baseSha, generated);
    let oldLog = "";
    try {
      oldLog = await input.repo.readBlob(baseSha, "log.md");
    } catch {
      oldLog = "";
    }

    const files: Record<string, string> = Object.fromEntries(generated);
    files["index.md"] = buildIndexMarkdown(pages, {
      workspaceCode: input.workspaceCode,
      generatedAt: now,
    });
    files["log.md"] = appendLogEntry(oldLog, {
      date: now,
      type: "ingest",
      summary: marker,
      details: input.files.map((file) => file.path),
    });

    const commit = await handle.repo.writeAndCommit({
      actor: "system",
      files,
      message: `[ingest] ${marker}`,
      author: {
        name: "jarvis-public-wiki-bot",
        email: "wiki-bot@example.invalid",
      },
    });
    await input.repo.fastForwardTo(commit.sha, baseSha);
    return { commitSha: commit.sha, affectedPaths: commit.affectedPaths, reused: false };
  } finally {
    await handle.cleanup();
  }
}
