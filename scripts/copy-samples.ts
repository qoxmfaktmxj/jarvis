import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { IngestSourceRevisionResult } from "../apps/worker/src/jobs/source-ingest.js";
import type { ProviderAdapter, ProviderPayload } from "../apps/worker/src/providers/index.js";
import { pathExists, readJsonFile, resolveInside } from "./fs-utils.js";

interface LegalCaseSeed {
  caseNumber: string;
  title: string;
  court: string;
  decisionDate?: string;
  caseType?: string;
  issues?: string[];
  disposition?: string;
  citedProvisions?: string[];
}

interface ManifestBase {
  relativePath: string;
  title: string;
  provider: "local";
  legalCase?: LegalCaseSeed;
}

interface SyntheticManifestEntry extends ManifestBase {
  synthetic: true;
  curated?: never;
  contactEmail: string;
}

interface CuratedManifestEntry extends ManifestBase {
  synthetic?: false;
  curated: true;
  sourceType: "law" | "case" | "interpretation" | "guide";
  canonicalUrl: string;
}

type ManifestEntry = SyntheticManifestEntry | CuratedManifestEntry;

export interface CopySamplesOptions {
  cwd?: string;
  manifestPath?: string;
  ingestSourceRevision?: (input: {
    workspaceId: string;
    providerAdapter: ProviderAdapter;
    manifestEntry: ManifestEntry;
  }) => Promise<string | IngestSourceRevisionResult>;
  seedLegalCaseFromSourceRevision?: (
    sourceRevisionId: string,
    legalCaseSeed: LegalCaseSeed
  ) => Promise<void>;
}

export interface CopySamplesEntryResult {
  relativePath: string;
  status: "upserted" | "unchanged";
  sourceRevisionId: string;
}

export interface CopySamplesResult {
  entries: CopySamplesEntryResult[];
}

function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadManifest(manifestPath: string): Promise<{ entries: ManifestEntry[] }> {
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as { entries?: unknown[] };
  for (const entry of raw.entries ?? []) {
    if (entry && typeof entry === "object") {
      for (const forbidden of ["sourceRevisionId", "rawObjectKey", "normalizedObjectKey", "documentId"]) {
        if (forbidden in entry) {
          throw new Error(`${forbidden} is assigned by ingestSourceRevision`);
        }
      }
    }
  }
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new Error("manifest entries are required");
  }
  return {
    entries: raw.entries.map((entry) => parseManifestEntry(entry)),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireEmail(value: unknown, field: string): string {
  const email = requireNonEmptyString(value, field);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !email.endsWith("@example.invalid")) {
    throw new Error(`${field} must use example.invalid`);
  }
  return email;
}

function parseLegalCaseSeed(value: unknown): LegalCaseSeed {
  if (!isPlainObject(value)) {
    throw new Error("legalCase must be an object");
  }
  return {
    caseNumber: requireNonEmptyString(value.caseNumber, "legalCase.caseNumber"),
    title: requireNonEmptyString(value.title, "legalCase.title"),
    court: requireNonEmptyString(value.court, "legalCase.court"),
    decisionDate: typeof value.decisionDate === "string" ? value.decisionDate : undefined,
    caseType: typeof value.caseType === "string" ? value.caseType : undefined,
    issues: Array.isArray(value.issues) ? value.issues.filter((item): item is string => typeof item === "string") : undefined,
    disposition: typeof value.disposition === "string" ? value.disposition : undefined,
    citedProvisions: Array.isArray(value.citedProvisions)
      ? value.citedProvisions.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

function parseManifestEntry(value: unknown): ManifestEntry {
  if (!isPlainObject(value)) {
    throw new Error("manifest entry must be an object");
  }
  if (value.provider !== "local") {
    throw new Error("manifest provider must be local");
  }
  const base = {
    relativePath: requireNonEmptyString(value.relativePath, "relativePath"),
    title: requireNonEmptyString(value.title, "title"),
    provider: "local" as const,
    legalCase: value.legalCase === undefined ? undefined : parseLegalCaseSeed(value.legalCase),
  };
  if (value.synthetic === true) {
    return {
      ...base,
      synthetic: true,
      contactEmail: requireEmail(value.contactEmail, "contactEmail"),
    };
  }
  if (value.curated !== true) {
    throw new Error("manifest entry must be synthetic or curated");
  }
  const sourceType = requireNonEmptyString(value.sourceType, "sourceType");
  if (sourceType !== "law" && sourceType !== "case" && sourceType !== "interpretation" && sourceType !== "guide") {
    throw new Error("invalid sourceType");
  }
  const canonicalUrl = requireNonEmptyString(value.canonicalUrl, "canonicalUrl");
  const url = new URL(canonicalUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    !/^\/qoxmfaktmxj\/withhold-tax\/blob\/[0-9a-f]{6,40}\/content\/facts\.json$/.test(url.pathname)
  ) {
    throw new Error("curated canonicalUrl must pin the withhold-tax facts.json revision");
  }
  return { ...base, curated: true, sourceType, canonicalUrl: url.toString() };
}

async function loadWorkspaceId(): Promise<string> {
  const [{ db, PUBLIC_WORKSPACE_CODE }, { workspace }, { eq }] = await Promise.all([
    import("@jarvis/db"),
    import("@jarvis/db/schema"),
    import("drizzle-orm"),
  ]);
  const [tenant] = await db.select({ id: workspace.id })
    .from(workspace)
    .where(eq(workspace.code, PUBLIC_WORKSPACE_CODE))
    .limit(1);
  if (!tenant) {
    throw new Error("PUBLIC_WORKSPACE_MISSING");
  }
  return tenant.id;
}

class LocalProviderAdapter implements ProviderAdapter {
  readonly id = "local";
  readonly canonicalHostnames = new Set(["example.invalid", "github.com"]);

  constructor(
    private readonly samplesRoot: string,
    private readonly entries: Map<string, ManifestEntry>,
  ) {}

  async list() {
    return {
      items: [...this.entries.entries()].map(([externalId, entry]) => ({
        externalId,
        title: entry.title,
      })),
    };
  }

  async fetch(externalId: string): Promise<ProviderPayload> {
    const entry = this.entries.get(externalId);
    if (!entry) {
      throw new Error(`local source not found: ${externalId}`);
    }
    const filePath = resolveInside(this.samplesRoot, entry.relativePath);
    const rawBytes = new Uint8Array(await readFile(filePath));
    const rawText = Buffer.from(rawBytes).toString("utf8");
    const source = JSON.parse(rawText) as Record<string, unknown>;
    return {
      document: {
        provider: this.id,
        externalId,
        sourceType: entry.synthetic === true ? "guide" : entry.sourceType,
        title: entry.title,
        canonicalUrl: entry.synthetic === true
          ? `https://example.invalid/sources/${encodeURIComponent(entry.relativePath)}`
          : entry.canonicalUrl,
        metadata: entry.synthetic === true
          ? { synthetic: true, contactEmail: entry.contactEmail }
          : { synthetic: false, curated: true },
      },
      revision: {
        revisionKey: typeof source.revisionKey === "string" ? source.revisionKey : "v1",
        publishedAt: new Date(typeof source.publishedAt === "string" ? source.publishedAt : "2026-01-01"),
        effectiveFrom: new Date(typeof source.effectiveFrom === "string" ? source.effectiveFrom : "2026-01-01"),
        effectiveTo: null,
        rawBytes,
        contentType: "application/json",
        normalizedText: typeof source.normalizedText === "string" ? source.normalizedText : rawText,
        metadata: entry.synthetic === true
          ? { synthetic: true, title: entry.title }
          : { synthetic: false, curated: true, title: entry.title },
      },
    };
  }
}

async function defaultIngestSourceRevision(
  _cwd: string,
  manifestEntry: ManifestEntry,
  adapter: ProviderAdapter,
): Promise<string> {
  const [{ ingestSourceRevision: workerIngestSourceRevision }, { createMinioObjectStoreFromEnv }] = await Promise.all([
    import("../apps/worker/src/jobs/source-ingest.js"),
    import("../packages/storage/src/index.js"),
  ]);
  const workspaceId = await loadWorkspaceId();
  const result = await workerIngestSourceRevision(
    {
      workspaceId,
      providerId: adapter.id,
      externalId: manifestEntry.relativePath,
    },
    {
      objectStore: createMinioObjectStoreFromEnv(process.env),
      resolveProvider: () => adapter,
    }
  );
  return result.sourceRevisionId;
}

async function defaultSeedLegalCaseFromSourceRevision(
  sourceRevisionId: string,
  legalCaseSeed: LegalCaseSeed,
): Promise<void> {
  const [{ db }, { legalCase }] = await Promise.all([
    import("@jarvis/db"),
    import("@jarvis/db/schema"),
  ]);
  const workspaceId = await loadWorkspaceId();
  await db.insert(legalCase).values({
    workspaceId,
    sourceRevisionId,
    courtOrAgency: legalCaseSeed.court,
    caseNumber: legalCaseSeed.caseNumber,
    decisionDate: legalCaseSeed.decisionDate ?? "2026-01-01",
    caseType: legalCaseSeed.caseType ?? "guide",
    issues: legalCaseSeed.issues ?? [legalCaseSeed.title],
    holdingSummary: legalCaseSeed.title,
    disposition: legalCaseSeed.disposition ?? null,
    citedProvisions: legalCaseSeed.citedProvisions ?? [],
    updatedAt: new Date(),
    createdAt: new Date(),
  }).onConflictDoNothing({
    target: [legalCase.sourceRevisionId],
  });
}

export async function copySamples({
  cwd = process.cwd(),
  manifestPath,
  ingestSourceRevision,
  seedLegalCaseFromSourceRevision,
}: CopySamplesOptions = {}): Promise<CopySamplesResult> {
  const resolvedManifestPath = manifestPath
    ? (() => {
        if (!isAbsolute(manifestPath)) {
          return resolveInside(cwd, manifestPath);
        }
        const absoluteManifestPath = resolve(manifestPath);
        const relativeToCwd = relative(resolve(cwd), absoluteManifestPath);
        if (relativeToCwd.startsWith("..") || isAbsolute(relativeToCwd)) {
          throw new Error("manifestPath must stay inside cwd");
        }
        return absoluteManifestPath;
      })()
    : join(cwd, "samples", "sources", "manifest.json");
  const manifest = await loadManifest(resolvedManifestPath);
  const samplesRoot = join(cwd, "samples", "sources");
  const runtimeRoot = join(cwd, ".runtime");
  if (await pathExists(runtimeRoot)) {
    const runtimeStats = await lstat(runtimeRoot);
    if (runtimeStats.isSymbolicLink()) {
      throw new Error(".runtime symlink or junction is not allowed");
    }
    if (!runtimeStats.isDirectory()) {
      throw new Error(".runtime must be a directory");
    }
  } else {
    await mkdir(runtimeRoot, { recursive: true });
  }
  const statePath = join(runtimeRoot, "sample-ingest-state.json");
  let previousState: Record<string, { hash: string; sourceRevisionId: string }> = {};
  if (await pathExists(statePath)) {
    const stateStats = await lstat(statePath);
    if (stateStats.isSymbolicLink()) {
      throw new Error("sample ingest state symlink or junction is not allowed");
    }
    if (!stateStats.isFile()) {
      throw new Error("sample ingest state must be a regular file");
    }
    previousState = await readJsonFile<Record<string, { hash: string; sourceRevisionId: string }>>(statePath);
  }
  const currentState: Record<string, { hash: string; sourceRevisionId: string }> = {};
  const manifestEntries = new Map(manifest.entries.map((entry) => [entry.relativePath, entry]));
  const adapter = new LocalProviderAdapter(samplesRoot, manifestEntries);
  const results: CopySamplesEntryResult[] = [];

  for (const entry of manifest.entries) {
    const filePath = resolveInside(samplesRoot, entry.relativePath);
    const fileStats = await lstat(filePath);
    if (fileStats.isSymbolicLink()) {
      throw new Error(`symlink denied: ${entry.relativePath}`);
    }
    if (!fileStats.isFile()) {
      throw new Error(`path is not a regular file: ${entry.relativePath}`);
    }

    const fileBytes = await readFile(filePath);
    const fileContents = Buffer.from(fileBytes).toString("utf8");
    const digest = hashContent(JSON.stringify({ entry, fileContents }));
    const previous = previousState[entry.relativePath];

    const sourceRevisionIdResult = await (ingestSourceRevision
      ? ingestSourceRevision({
          workspaceId: "00000000-0000-0000-0000-000000000000",
          providerAdapter: adapter,
          manifestEntry: entry,
        })
      : defaultIngestSourceRevision(cwd, entry, adapter));

    const sourceRevisionId =
      typeof sourceRevisionIdResult === "string"
        ? sourceRevisionIdResult
        : sourceRevisionIdResult.sourceRevisionId;

    if (entry.legalCase) {
      await (seedLegalCaseFromSourceRevision ?? defaultSeedLegalCaseFromSourceRevision)(
        sourceRevisionId,
        entry.legalCase
      );
    }

    currentState[entry.relativePath] = { hash: digest, sourceRevisionId };
    results.push({
      relativePath: entry.relativePath,
      status: previous && previous.hash === digest ? "unchanged" : "upserted",
      sourceRevisionId,
    });
  }

  await writeFile(statePath, `${JSON.stringify(currentState, null, 2)}\n`);
  return { entries: results };
}

export async function main(): Promise<void> {
  await copySamples();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "copy-samples failed");
    process.exitCode = 1;
  });
}
