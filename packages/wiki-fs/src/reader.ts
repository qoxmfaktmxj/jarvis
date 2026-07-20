import { resolveContainedPath } from "./path-policy.js";
import { readUtf8 } from "./writer.js";

export async function readPage(repoRoot: string, repoRelativePath: string): Promise<string> {
  const absolute = await resolveContainedPath(repoRoot, repoRelativePath);
  return readUtf8(absolute);
}
