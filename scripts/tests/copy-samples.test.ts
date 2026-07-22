import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:process";
import { describe, expect, it, vi } from "vitest";
import { copySamples } from "../copy-samples.js";

describe("copySamples", () => {
  it("rejects path escape, symlink targets, and predeclared ingest-owned ids", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-copy-samples-"));
    const samplesRoot = join(sandbox, "samples", "sources");
    await mkdir(samplesRoot, { recursive: true });
    await writeFile(join(samplesRoot, "allowed.json"), JSON.stringify({ title: "ok" }));
    await writeFile(join(samplesRoot, "outside.json"), JSON.stringify({ title: "no" }));
    await mkdir(join(samplesRoot, "real-dir"), { recursive: true });
    await writeFile(join(samplesRoot, "real-dir", "nested.json"), JSON.stringify({ title: "nested" }));
    await symlink(
      join(samplesRoot, "real-dir"),
      join(samplesRoot, "linked-dir"),
      platform === "win32" ? "junction" : "dir"
    );

    const badManifestPath = join(sandbox, "manifest-bad.json");
    await writeFile(
      badManifestPath,
      JSON.stringify({
        entries: [
          {
            relativePath: "linked-dir",
            synthetic: true,
            title: "bad",
            provider: "local",
            contactEmail: "hr-demo@example.invalid",
          },
        ],
      })
    );

    const forbiddenIdManifestPath = join(sandbox, "manifest-forbidden.json");
    await writeFile(
      forbiddenIdManifestPath,
      JSON.stringify({
        entries: [
          {
            relativePath: "allowed.json",
            synthetic: true,
            title: "bad",
            provider: "local",
            contactEmail: "hr-demo@example.invalid",
            sourceRevisionId: "sr_local_001",
          },
        ],
      })
    );

    await expect(copySamples({ manifestPath: badManifestPath, cwd: sandbox })).rejects.toThrow(
      /symlink|escape|absolute|path/i
    );
    await expect(copySamples({ manifestPath: forbiddenIdManifestPath, cwd: sandbox })).rejects.toThrow(
      /object key|uuid|sourceRevisionId/i
    );
  });

  it("seeds optional legal cases only after ingest returns sourceRevisionId and stays idempotent", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-copy-samples-idempotent-"));
    const samplesRoot = join(sandbox, "samples", "sources");
    await mkdir(samplesRoot, { recursive: true });
    const trackedBytes = "{\n  \"synthetic\": true,\n  \"normalizedText\": \"원본 바이트를 유지해야 한다.\"\n}\n";
    await writeFile(join(samplesRoot, "average-wage.json"), trackedBytes);

    const manifestPath = join(samplesRoot, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        entries: [
          {
            relativePath: "average-wage.json",
            synthetic: true,
            title: "평균임금 산정 예시",
            provider: "local",
            contactEmail: "hr-demo@example.invalid",
            legalCase: {
              caseNumber: "SYNTH-2026-001",
              title: "합성 사건",
              court: "Demo Court",
            },
          },
        ],
      })
    );

    const ingestSourceRevision = vi.fn(async ({ providerAdapter, manifestEntry }) => {
      const payload = await providerAdapter.fetch(manifestEntry.relativePath);
      expect(Buffer.from(payload.revision.rawBytes).toString("utf8")).toBe(trackedBytes);
      return "sr_local_001";
    });
    const seedLegalCaseFromSourceRevision = vi.fn().mockResolvedValue(undefined);

    const first = await copySamples({
      manifestPath: "samples/sources/manifest.json",
      cwd: sandbox,
      ingestSourceRevision,
      seedLegalCaseFromSourceRevision,
    });
    const second = await copySamples({
      manifestPath,
      cwd: sandbox,
      ingestSourceRevision,
      seedLegalCaseFromSourceRevision,
    });

    expect(first.entries[0]?.sourceRevisionId).toBe("sr_local_001");
    expect(seedLegalCaseFromSourceRevision).toHaveBeenCalledWith(
      "sr_local_001",
      expect.objectContaining({ caseNumber: "SYNTH-2026-001" })
    );
    expect(
      second.entries.every(
        (entry) => entry.status === "unchanged" || entry.status === "upserted"
      )
    ).toBe(true);
    expect(ingestSourceRevision).toHaveBeenCalledTimes(2);
  });

  it("rejects .runtime state symlink or junction before ingest", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-copy-samples-runtime-link-"));
    const samplesRoot = join(sandbox, "samples", "sources");
    const runtimeTarget = join(sandbox, "runtime-target");
    await mkdir(samplesRoot, { recursive: true });
    await mkdir(runtimeTarget, { recursive: true });
    await writeFile(join(samplesRoot, "sample.json"), "{\"normalizedText\":\"x\"}\n");
    await writeFile(
      join(samplesRoot, "manifest.json"),
      JSON.stringify({
        entries: [
          {
            relativePath: "sample.json",
            synthetic: true,
            title: "샘플",
            provider: "local",
            contactEmail: "hr-demo@example.invalid",
          },
        ],
      })
    );
    await symlink(
      runtimeTarget,
      join(sandbox, ".runtime"),
      platform === "win32" ? "junction" : "dir"
    );

    await expect(
      copySamples({
        cwd: sandbox,
        manifestPath: "samples/sources/manifest.json",
        ingestSourceRevision: vi.fn().mockResolvedValue("sr_local_002"),
      })
    ).rejects.toThrow(/symlink|junction/i);
  });

  it("ingests a curated local snapshot with an exact provenance URL", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-copy-samples-curated-"));
    const samplesRoot = join(sandbox, "samples", "sources");
    await mkdir(samplesRoot, { recursive: true });
    await writeFile(
      join(samplesRoot, "withholding.json"),
      JSON.stringify({
        revisionKey: "abc123",
        publishedAt: "2026-06-15",
        effectiveFrom: "2026-06-15",
        normalizedText: "verified.fact\n확정된 원천징수 자료",
      }),
    );
    await writeFile(
      join(samplesRoot, "manifest.json"),
      JSON.stringify({
        entries: [
          {
            relativePath: "withholding.json",
            curated: true,
            title: "원천징수 검증 자료",
            provider: "local",
            sourceType: "guide",
            canonicalUrl: "https://github.com/qoxmfaktmxj/withhold-tax/blob/abc123/content/facts.json",
          },
        ],
      }),
    );

    const ingestSourceRevision = vi.fn(async ({ providerAdapter, manifestEntry }) => {
      const payload = await providerAdapter.fetch(manifestEntry.relativePath);
      expect(payload.document).toMatchObject({
        sourceType: "guide",
        canonicalUrl: "https://github.com/qoxmfaktmxj/withhold-tax/blob/abc123/content/facts.json",
        metadata: { curated: true, synthetic: false },
      });
      return "sr_curated_001";
    });

    await copySamples({ cwd: sandbox, ingestSourceRevision });
    expect(ingestSourceRevision).toHaveBeenCalledOnce();
  });
});
