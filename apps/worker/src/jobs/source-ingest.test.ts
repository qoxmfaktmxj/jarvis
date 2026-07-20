import { describe, expect, it, vi } from "vitest";
import { sha256 } from "@jarvis/storage";
import { fakeProvider } from "../providers/fake.js";
import {
  handleSourceIngestJob,
  ingestSourceRevision,
  type IngestSourceRevisionInput,
  type IngestSourceRevisionResult,
  type ImmutableObjectStore,
  type PutObjectInput,
  type SourceIngestRepository,
} from "./source-ingest.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";

describe("ingestSourceRevision", () => {
  it("stores raw/normalized objects and skips a duplicate checksum", async () => {
    const objects = new Map<string, Uint8Array>();
    const putInputs: PutObjectInput[] = [];
    const objectStore: ImmutableObjectStore = {
      async putIfAbsent(input) {
        expect(sha256(input.body)).toBe(input.checksum);
        putInputs.push(input);
        if (objects.has(input.key)) return { created: false };
        objects.set(input.key, input.body);
        return { created: true };
      },
      async getText(key) {
        const body = objects.get(key);
        if (!body) throw new Error("not found");
        return new TextDecoder().decode(body);
      },
    };
    const revisions = new Map<string, string>();
    const repository: SourceIngestRepository = {
      upsertDocument: vi.fn(async () => ({ id: DOCUMENT_ID })),
      findRevisionByChecksum: vi.fn(async ({ checksumSha256 }) => {
        const id = revisions.get(checksumSha256);
        return id ? { id } : null;
      }),
      findRevisionByKey: vi.fn(async () => null),
      commitRevision: vi.fn(async (input) => {
        revisions.set(input.checksumSha256, REVISION_ID);
        return { id: REVISION_ID, created: true, stalePageCount: 0 };
      }),
    };
    const deps = { objectStore, repository, resolveProvider: () => fakeProvider };
    const request = {
      workspaceId: WORKSPACE_ID,
      providerId: fakeProvider.id,
      externalId: "synthetic-annual-leave-guide-001",
      retrievedAt: new Date("2026-07-20T00:00:00.000Z"),
    };

    const first = await ingestSourceRevision(request, deps);
    const second = await ingestSourceRevision(request, deps);

    expect(first).toMatchObject({ created: true, sourceDocumentId: DOCUMENT_ID, sourceRevisionId: REVISION_ID });
    expect(second).toMatchObject({ created: false, sourceDocumentId: DOCUMENT_ID, sourceRevisionId: REVISION_ID });
    expect(repository.commitRevision).toHaveBeenCalledTimes(1);
    expect(putInputs).toHaveLength(2);
    const raw = putInputs.find((item) => item.key.includes(".raw."));
    const normalized = putInputs.find((item) => item.key.includes(".normalized."));
    expect(raw?.contentType).toBe("text/plain");
    expect(normalized?.contentType).toBe("text/plain");
    expect(normalized?.checksum).toBe(sha256(normalized!.body));
    expect(normalized?.checksum).not.toBe(raw?.checksum);
  });

  it("rejects an unknown provider without touching storage", async () => {
    const objectStore: ImmutableObjectStore = { putIfAbsent: vi.fn(), getText: vi.fn() };

    await expect(ingestSourceRevision({
      workspaceId: WORKSPACE_ID,
      providerId: "user-supplied-url",
      externalId: "https://attacker.example/source",
    }, {
      objectStore,
      resolveProvider: () => {
        throw new Error("provider not enabled");
      },
    })).rejects.toThrow(/provider not enabled/);

    expect(objectStore.putIfAbsent).not.toHaveBeenCalled();
  });

  it("rejects revision-key reuse with different content before storage writes", async () => {
    const objectStore: ImmutableObjectStore = { putIfAbsent: vi.fn(), getText: vi.fn() };
    const repository: SourceIngestRepository = {
      upsertDocument: vi.fn(async () => ({ id: DOCUMENT_ID })),
      findRevisionByChecksum: vi.fn(async () => null),
      findRevisionByKey: vi.fn(async () => ({ id: REVISION_ID, checksumSha256: "0".repeat(64) })),
      commitRevision: vi.fn(),
    };

    await expect(ingestSourceRevision({
      workspaceId: WORKSPACE_ID,
      providerId: fakeProvider.id,
      externalId: "synthetic-annual-leave-guide-001",
    }, {
      objectStore,
      repository,
      resolveProvider: () => fakeProvider,
    })).rejects.toThrow(/revision key already exists/);

    expect(objectStore.putIfAbsent).not.toHaveBeenCalled();
    expect(repository.commitRevision).not.toHaveBeenCalled();
  });

  it("enqueues wiki-ingest only when a new source revision is created", async () => {
    const boss = { send: vi.fn(async () => null) };
    const service = vi
      .fn<(input: IngestSourceRevisionInput) => Promise<IngestSourceRevisionResult>>()
      .mockResolvedValueOnce({
        sourceDocumentId: DOCUMENT_ID,
        sourceRevisionId: REVISION_ID,
        created: true,
        stalePageCount: 0,
        rawObjectCreated: true,
        normalizedObjectCreated: true,
      })
      .mockResolvedValueOnce({
        sourceDocumentId: DOCUMENT_ID,
        sourceRevisionId: REVISION_ID,
        created: false,
        stalePageCount: 0,
        rawObjectCreated: false,
        normalizedObjectCreated: false,
      });

    const payload = {
      workspaceId: WORKSPACE_ID,
      providerId: fakeProvider.id,
      externalId: "synthetic-annual-leave-guide-001",
    };

    await handleSourceIngestJob(payload, { boss, service });
    await handleSourceIngestJob(payload, { boss, service });

    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledWith(`wiki-ingest:${WORKSPACE_ID}`, {
      workspaceId: WORKSPACE_ID,
      sourceRevisionId: REVISION_ID,
    });
  });
});
