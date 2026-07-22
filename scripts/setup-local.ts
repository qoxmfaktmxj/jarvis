import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pathExists } from "./fs-utils.js";

const REQUIRED_LOCAL_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "WIKI_REPO_ROOT",
  "MINIO_ENDPOINT",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
  "LLM_GATEWAY_URL",
  "LLM_GATEWAY_KEY",
  "ASK_AI_MODEL",
  "INGEST_AI_MODEL",
] as const;

export interface RunCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type RunCommand = (
  command: string,
  args: string[],
  options: RunCommandOptions,
) => Promise<void>;

export interface SetupLocalOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  run?: RunCommand;
}

export interface DataSyncOptions extends SetupLocalOptions {}

function randomSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function renderLocalEnv(options: { cwd: string }): string {
  const password = randomSecret();
  const sessionSecret = randomSecret();
  const accessKey = `jarvis-${randomBytes(9).toString("hex")}`;
  const secretKey = randomSecret();
  const wikiRepoRoot = resolve(options.cwd, ".runtime", "wiki-repo").replaceAll("\\", "/");
  return [
    "POSTGRES_DB=jarvis_public",
    "POSTGRES_USER=jarvis_public",
    "POSTGRES_PORT=55432",
    `POSTGRES_PASSWORD=${password}`,
    `DATABASE_URL=postgresql://jarvis_public:${password}@127.0.0.1:55432/jarvis_public`,
    `SESSION_SECRET=${sessionSecret}`,
    `WIKI_REPO_ROOT=${wikiRepoRoot}`,
    "MINIO_ENDPOINT=http://127.0.0.1:59000",
    `MINIO_ACCESS_KEY=${accessKey}`,
    `MINIO_SECRET_KEY=${secretKey}`,
    "MINIO_BUCKET=jarvis-public-sources",
    "LLM_GATEWAY_URL=http://127.0.0.1:8317/v1",
    "LLM_GATEWAY_KEY=sk-jarvis-local-dev",
    "ASK_AI_MODEL=gpt-5.6-terra",
    "INGEST_AI_MODEL=gpt-5.6-sol",
    "ASK_DAILY_BUDGET_USD=1",
    "",
  ].join("\n");
}

function parseEnvContents(contents: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    parsed[line.slice(0, index)] = line.slice(index + 1);
  }
  return parsed;
}

export async function loadAndValidateLocalEnv(envPath: string, requiredKeys = REQUIRED_LOCAL_KEYS): Promise<NodeJS.ProcessEnv> {
  const parsed = parseEnvContents(await readFile(envPath, "utf8"));
  for (const key of requiredKeys) {
    if (!parsed[key]?.trim()) {
      throw new Error(`missing required local env key: ${key}`);
    }
  }
  if (parsed.BOOTSTRAP_ADMIN_EMAIL || parsed.BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error("bootstrap admin credentials must not be persisted locally");
  }
  return parsed;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions,
): Promise<void> {
  const isWindowsPnpm = process.platform === "win32" && command === "pnpm";
  const executable = isWindowsPnpm
    ? (process.env.ComSpec ?? "cmd.exe")
    : process.platform === "win32" && command === "docker"
      ? "docker.exe"
      : command;
  const spawnArgs = isWindowsPnpm
    ? ["/d", "/s", "/c", "pnpm.cmd", ...args]
    : args;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(executable, spawnArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
      shell: false,
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? -1}`));
    });
  });
}

export async function setupLocal({
  env = process.env,
  cwd = process.cwd(),
  run = runCommand,
}: SetupLocalOptions = {}): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("setup:local is disabled in production");
  }

  const envPath = join(cwd, ".env.local");
  if (!(await pathExists(envPath))) {
    await writeFile(envPath, renderLocalEnv({ cwd }), { flag: "wx" });
  }

  const localEnv = {
    ...env,
    ...(await loadAndValidateLocalEnv(envPath)),
  };

  const options = { cwd, env: localEnv };
  await run("docker", ["compose", "--env-file", resolve(envPath), "-f", "infra/compose.yaml", "--project-name", "jarvis-public-local", "up", "-d", "--wait"], options);
  await run("pnpm", ["db:migrate"], options);
  await run("pnpm", ["db:seed"], options);
  await run("pnpm", ["samples:ingest"], options);
  const wikiCommand = await pathExists(localEnv.WIKI_REPO_ROOT!)
    ? "wiki:sync-samples"
    : "wiki:bootstrap";
  await run("pnpm", [wikiCommand], options);
  await run("pnpm", ["wiki:project"], options);
}

export async function dataSync({
  env = process.env,
  cwd = process.cwd(),
  run = runCommand,
}: DataSyncOptions = {}): Promise<void> {
  const localEnv = {
    ...env,
    ...(await loadAndValidateLocalEnv(join(cwd, ".env.local"))),
  };
  const options = { cwd, env: localEnv };
  await run("pnpm", ["samples:ingest"], options);
  await run("pnpm", ["wiki:sync-samples"], options);
  await run("pnpm", ["wiki:project"], options);
}

export async function main(): Promise<void> {
  await setupLocal();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "setup-local failed");
    process.exitCode = 1;
  });
}
