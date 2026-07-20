import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  askAgentStream,
  collect,
  createDeterministicMockProvider,
  locateSourceSegment,
  type AskAgentDeps,
  type AskEvent,
} from "@jarvis/ai";
import { PERMISSIONS } from "@jarvis/shared";
import { z } from "zod";

const fixtureRowSchema = z.object({
  question: z.string().trim().min(1),
  expectedCitations: z.array(z.string().regex(/^\[\[[a-z0-9-]{1,240}\]\]$/)).min(1),
  mode: z.literal("mock"),
}).strict();

interface EvalRow {
  question: string;
  passed: boolean;
  citations: string[];
}

const SOURCE_REVISION_ID = "11111111-1111-4111-8111-111111111111";

export async function runPageFirstQa(fixturePath: string): Promise<EvalRow[]> {
  const absolute = resolve(process.cwd(), fixturePath);
  const raw = await readFile(absolute, "utf8");
  const rows = raw
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => fixtureRowSchema.parse(JSON.parse(line) as unknown));

  return Promise.all(rows.map(async (row, index) => {
    const slug = row.expectedCitations[0]!.slice(2, -2);
    const events = await collect(askAgentStream(
      { question: row.question, conversationId: `eval-${index}` },
      createEvalDeps(slug),
    ));
    const citations = wikiCitations(events);
    return {
      question: row.question,
      citations,
      passed: citations.length === row.expectedCitations.length &&
        row.expectedCitations.every((value, citationIndex) => value === citations[citationIndex]),
    };
  }));
}

function createEvalDeps(slug: string): AskAgentDeps {
  const path = `auto/concepts/${slug}.md`;
  return {
    context: {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      accountType: "demo",
      permissions: new Set([
        PERMISSIONS.ASK_USE,
        PERMISSIONS.WIKI_READ,
        PERMISSIONS.SOURCE_READ,
      ]),
    },
    provider: createDeterministicMockProvider("default"),
    searcher: {
      async searchEvidence() {
        return [
          {
            resourceType: "wiki" as const,
            id: `wiki-${slug}`,
            title: slug,
            snippet: `${slug} synthetic fixture`,
            score: 1,
            slug,
            path,
            sourceRevisionId: null,
            locator: null,
            effectiveFrom: null,
            canonicalUrl: null,
          },
          {
            resourceType: "source" as const,
            id: `source-${slug}`,
            title: `${slug} source`,
            snippet: `${slug} synthetic source`,
            score: 0.9,
            slug: null,
            path: null,
            sourceRevisionId: SOURCE_REVISION_ID,
            locator: "paragraph:1",
            effectiveFrom: "2026-07-20",
            canonicalUrl: "https://example.invalid/source",
          },
        ];
      },
    },
    wikiRepo: {
      async headSha() {
        return "a".repeat(40);
      },
      async readBlob() {
        return `# ${slug}\n\nSynthetic evidence for [[${slug}]].\n`;
      },
    },
    sourceRevisionRepository: {
      async findReadableRevision(input) {
        return {
          id: input.sourceRevisionId,
          workspaceId: input.workspaceId,
          sourceDocumentId: `document-${slug}`,
          title: `${slug} source`,
          canonicalUrl: "https://example.invalid/source",
          effectiveFrom: "2026-07-20",
          normalizedObjectKey: `sources/${slug}.txt`,
        };
      },
    },
    objectStore: {
      async getText() {
        return `${slug} synthetic evidence.`;
      },
    },
    locateSourceSegment,
    rateLimiter: { async consume() {} },
    budget: { async reserve() {}, async finalize() {} },
    logs: { async logSearch() {} },
  };
}

function wikiCitations(events: readonly AskEvent[]): string[] {
  return events
    .filter((event): event is Extract<AskEvent, { type: "source" }> =>
      event.type === "source" && event.source.kind === "wiki" && Boolean(event.source.slug))
    .map((event) => `[[${event.source.slug!}]]`);
}

async function main(): Promise<void> {
  const fixtureFlag = process.argv.indexOf("--fixture");
  const fixture = fixtureFlag >= 0 ? process.argv[fixtureFlag + 1] : "";
  if (!fixture) throw new Error("--fixture is required");
  const rows = await runPageFirstQa(fixture);
  if (rows.some((row) => !row.passed)) {
    process.stderr.write(`${JSON.stringify(rows, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
