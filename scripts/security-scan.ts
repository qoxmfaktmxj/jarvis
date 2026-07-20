import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

type AllowEntry = {
  ruleId: string;
  path: string;
  match: string;
  reason: string;
};

type Finding = {
  ruleId: string;
  path: string;
  match: string;
};

type ScanMode = "content" | "nested-git" | "gate";
type GitPhase = "pre-init" | "post-init";

export interface SecurityScanOptions {
  cwd?: string;
  mode?: ScanMode;
  phase?: GitPhase;
}

const GENERATED_ROOTS = new Set([
  ".runtime",
  "artifacts",
  "node_modules",
  ".next",
  ".next-e2e",
  ".turbo",
  ".vite",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);
const SAFE_LOCAL_ROOT_ENTRIES = new Set([".env.local"]);
const SOURCE_SKIP = new Set(GENERATED_ROOTS);
const GIT_SKIP = new Set([
  "artifacts",
  "node_modules",
  ".next",
  ".next-e2e",
  ".turbo",
  ".vite",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".dll",
  ".doc",
  ".docx",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".tar",
  ".webp",
  ".xls",
  ".xlsx",
  ".zip",
]);
const FORBIDDEN_TERMS = [
  ["sa", "les"].join(""),
  ["service", "-", "desk"].join(""),
  ["main", "tenance"].join(""),
  ["con", "tractor"].join(""),
  ["graph", "ify"].join(""),
  ["knowledge", "_page"].join(""),
  ["dev", "-", "accounts"].join(""),
  ["cli", "proxy"].join(""),
];
const RULES = [
  { id: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    id: "credential-assignment",
    regex: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"']{8,}["']/gi,
  },
  { id: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  {
    id: "private-ip",
    regex: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g,
  },
  { id: "windows-user-path", regex: /\b[A-Za-z]:\\Users\\[^\\\s]+/g },
  { id: "forbidden-term", regex: new RegExp(`\\b(?:${FORBIDDEN_TERMS.join("|")})\\b`, "gi") },
] as const;
const ALLOWLISTABLE_RULE_IDS = new Set(["forbidden-term"]);

function toRepoPath(root: string, absolutePath: string): string {
  return relative(resolve(root), resolve(absolutePath)).split(sep).join("/") || ".";
}

async function loadAllowlist(path: string): Promise<AllowEntry[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("public scan allowlist must be an array");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`allowlist[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "match,path,reason,ruleId") {
      throw new Error(`allowlist[${index}] has invalid keys`);
    }
    for (const key of ["ruleId", "path", "match", "reason"] as const) {
      if (typeof record[key] !== "string" || record[key].trim().length === 0) {
        throw new Error(`allowlist[${index}].${key} must be a non-empty string`);
      }
    }
    if (!ALLOWLISTABLE_RULE_IDS.has(record.ruleId as string)) {
      throw new Error(`allowlist[${index}].ruleId cannot be allowlisted`);
    }
    return {
      ruleId: record.ruleId as string,
      path: record.path as string,
      match: record.match as string,
      reason: record.reason as string,
    };
  });
}

async function loadExportAllowlist(root: string): Promise<string[]> {
  const parsed: unknown = JSON.parse(
    await readFile(resolve(root, "config/public-export-allowlist.json"), "utf8"),
  );
  if (
    !Array.isArray(parsed)
    || parsed.some((entry) =>
      typeof entry !== "string"
        || entry.length === 0
        || entry === "."
        || entry === ".."
        || isAbsolute(entry)
        || entry.includes("/")
        || entry.includes("\\")
        || entry.includes("*"),
    )
  ) {
    throw new Error("public export allowlist must be an exact string array");
  }
  return parsed as string[];
}

function isExactAllowlisted(allowlist: AllowEntry[], finding: Finding): boolean {
  return allowlist.some((entry) =>
    entry.ruleId === finding.ruleId
      && entry.path === finding.path
      && entry.match === finding.match
      && entry.reason.trim().length > 0,
  );
}

function isAllowlistDeclaration(allowlist: AllowEntry[], finding: Finding): boolean {
  return ALLOWLISTABLE_RULE_IDS.has(finding.ruleId)
    && finding.path === "config/public-scan-allowlist.json"
    && allowlist.some((entry) => entry.ruleId === finding.ruleId && entry.match === finding.match);
}

async function listSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(absolutePath: string): Promise<void> {
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`security scan rejects symlink: ${toRepoPath(root, absolutePath)}`);
    }
    if (stat.isDirectory()) {
      for (const entry of await readdir(absolutePath)) {
        if (SOURCE_SKIP.has(entry)) continue;
        await walk(resolve(absolutePath, entry));
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error(`security scan rejects special file: ${toRepoPath(root, absolutePath)}`);
    }
    files.push(absolutePath);
  }

  const sourceRoots = await loadExportAllowlist(root);
  const rootEntries = await readdir(root, { withFileTypes: true });
  const allowed = new Set([...sourceRoots, ...GENERATED_ROOTS, ...SAFE_LOCAL_ROOT_ENTRIES]);
  for (const entry of rootEntries) {
    if (!allowed.has(entry.name) && entry.name !== ".git") {
      throw new Error(`root entry is outside public export allowlist: ${entry.name}`);
    }
  }
  for (const entry of sourceRoots) await walk(resolve(root, entry));
  return files.sort();
}

async function isBinary(path: string): Promise<boolean> {
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return true;
  return (await readFile(path)).subarray(0, 8192).includes(0);
}

async function scanContent(root: string, allowlist: AllowEntry[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const absolutePath of await listSourceFiles(root)) {
    const relativePath = toRepoPath(root, absolutePath);
    if (await isBinary(absolutePath)) {
      const rawFinding = { ruleId: "binary", path: relativePath, match: "<binary>" };
      if (!isExactAllowlisted(allowlist, rawFinding)) findings.push(rawFinding);
      continue;
    }
    const text = await readFile(absolutePath, "utf8");
    for (const rule of RULES) {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      for (const match of text.matchAll(regex)) {
        const raw = match[0];
        const rawFinding = { ruleId: rule.id, path: relativePath, match: raw };
        if (rule.id === "email" && /@[^@]+\.invalid$/i.test(raw)) continue;
        if (isAllowlistDeclaration(allowlist, rawFinding)) continue;
        if (isExactAllowlisted(allowlist, rawFinding)) continue;
        findings.push({ ...rawFinding, match: "<redacted>" });
      }
    }
  }
  return findings.sort((left, right) =>
    left.path.localeCompare(right.path)
      || left.ruleId.localeCompare(right.ruleId)
      || left.match.localeCompare(right.match),
  );
}

async function findGitMarkers(root: string): Promise<string[]> {
  const found: string[] = [];
  const rootGit = resolve(root, ".git");
  try {
    const stat = await lstat(rootGit);
    if (stat.isSymbolicLink()) throw new Error("root Git marker is a symlink");
    if (!stat.isDirectory()) throw new Error("root Git marker must be a directory");
    found.push(".git");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (directory === root && entry.name === ".git") continue;
      if (GIT_SKIP.has(entry.name)) continue;
      const absolutePath = resolve(directory, entry.name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`nested git scan rejects symlink: ${toRepoPath(root, absolutePath)}`);
      }
      if (entry.name === ".git") {
        if (!stat.isDirectory()) {
          throw new Error(`nested Git marker must be a directory: ${toRepoPath(root, absolutePath)}`);
        }
        found.push(toRepoPath(root, absolutePath));
        continue;
      }
      if (stat.isDirectory()) await walk(absolutePath);
    }
  }

  await walk(root);
  return Array.from(new Set(found)).sort();
}

async function detectGitPhase(root: string): Promise<GitPhase> {
  try {
    const stat = await lstat(resolve(root, ".git"));
    if (stat.isSymbolicLink()) throw new Error("root Git marker is a symlink");
    if (!stat.isDirectory()) throw new Error("root Git marker must be a directory");
    return "post-init";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "pre-init";
    throw error;
  }
}

function expectedGitDirs(phase: GitPhase): string[] {
  return phase === "pre-init"
    ? [".runtime/wiki-repo/.git"]
    : [".git", ".runtime/wiki-repo/.git"];
}

export async function securityScan({
  cwd = process.cwd(),
  mode = "content",
  phase = "pre-init",
}: SecurityScanOptions = {}): Promise<void> {
  if (mode === "nested-git" && phase !== "pre-init" && phase !== "post-init") {
    throw new Error(`unsupported nested Git phase: ${phase}`);
  }
  const root = resolve(cwd);
  const artifactsRoot = resolve(root, "artifacts/security");
  await mkdir(artifactsRoot, { recursive: true });

  if (mode === "gate") {
    await securityScan({ cwd: root, mode: "content" });
    await securityScan({ cwd: root, mode: "nested-git", phase: await detectGitPhase(root) });
    return;
  }

  if (mode === "nested-git") {
    const found = await findGitMarkers(root);
    const expected = expectedGitDirs(phase);
    const unexpected = found.filter((value) => !expected.includes(value));
    const missing = expected.filter((value) => !found.includes(value));
    const report = { phase, found, expected, unexpected, missing };
    await writeFile(
      resolve(artifactsRoot, `nested-git-${phase}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (unexpected.length > 0 || missing.length > 0) {
      throw new Error("unexpected nested Git markers; see redacted security artifact");
    }
    return;
  }
  if (mode !== "content") throw new Error(`unsupported security scan mode: ${mode}`);

  const findings = await scanContent(
    root,
    await loadAllowlist(resolve(root, "config/public-scan-allowlist.json")),
  );
  await writeFile(
    resolve(artifactsRoot, "local-scan.json"),
    `${JSON.stringify(findings, null, 2)}\n`,
  );
  if (findings.length > 0) {
    throw new Error(`security scan found ${findings.length} forbidden item(s); see redacted report`);
  }
}

export function parseSecurityScanCliArgs(args: string[]): SecurityScanOptions {
  const [mode, phase, ...extra] = args;
  if (!mode) throw new Error("security scan mode is required");
  if (extra.length > 0) throw new Error("too many security scan arguments");
  if (mode === "content" || mode === "gate") {
    if (phase) throw new Error(`${mode} mode does not accept a phase`);
    return { mode };
  }
  if (mode !== "nested-git") throw new Error(`unsupported security scan mode: ${mode}`);
  if (phase !== "pre-init" && phase !== "post-init") {
    throw new Error("nested-git phase is required: pre-init or post-init");
  }
  return { mode, phase };
}

export async function main(): Promise<void> {
  await securityScan(parseSecurityScanCliArgs(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "security-scan failed");
    process.exitCode = 1;
  });
}
