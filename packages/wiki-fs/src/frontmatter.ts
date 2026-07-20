import YAML from "yaml";

import type {
  EvidenceSourceRef,
  WikiFrontmatter,
  WikiPageType,
  WikiPublishedStatus,
} from "./types.js";

const FRONTMATTER_KEYS = new Set([
  "title",
  "slug",
  "pageType",
  "publishedStatus",
  "sources",
  "aliases",
  "tags",
  "created",
  "updated",
  "freshnessSlaDays",
]);

const ORDERED_KEYS = [
  "title",
  "slug",
  "pageType",
  "publishedStatus",
  "sources",
  "aliases",
  "tags",
  "created",
  "updated",
  "freshnessSlaDays",
] as const satisfies readonly (keyof WikiFrontmatter)[];

export function splitFrontmatter(source: string): {
  frontmatter: string | null;
  body: string;
} {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { frontmatter: null, body: normalized };
  const closeIndex = normalized.indexOf("\n---\n", 4);
  if (closeIndex >= 0) {
    return {
      frontmatter: normalized.slice(4, closeIndex),
      body: normalized.slice(closeIndex + 5),
    };
  }
  if (normalized.endsWith("\n---")) {
    return {
      frontmatter: normalized.slice(4, -4),
      body: "",
    };
  }
  return { frontmatter: null, body: normalized };
}

export function parseFrontmatter(source: string): { data: WikiFrontmatter; body: string } {
  const { frontmatter, body } = splitFrontmatter(source);
  if (frontmatter === null) return { data: defaultFrontmatter(), body };
  const parsed = YAML.parse(frontmatter, { maxAliasCount: 50 }) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("frontmatter must be a mapping");
  }
  const record = parsed as Record<string, unknown>;
  assertAllowedKeys(record);
  return {
    data: parseData(record),
    body,
  };
}

export function serializeFrontmatter(data: WikiFrontmatter, body: string): string {
  const record = data as unknown as Record<string, unknown>;
  assertAllowedKeys(record);
  const validated = parseData(record);
  const ordered: Record<string, unknown> = {};
  for (const key of ORDERED_KEYS) {
    const value = validated[key];
    if (value !== undefined) ordered[key] = value;
  }
  const yamlText = YAML.stringify(ordered, {
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
    singleQuote: false,
    lineWidth: 0,
  }).trimEnd();
  return `---\n${yamlText}\n---\n${body.replace(/\r\n/g, "\n")}`;
}

export function defaultFrontmatter(): WikiFrontmatter {
  const now = new Date().toISOString();
  return {
    title: "",
    slug: "",
    pageType: "concept",
    publishedStatus: "draft",
    sources: [],
    aliases: [],
    tags: [],
    created: now,
    updated: now,
  };
}

function parseData(parsed: Record<string, unknown>): WikiFrontmatter {
  const freshnessSlaDays = parseOptionalPositiveInt(parsed.freshnessSlaDays);
  return {
    title: requireString(parsed.title, "title"),
    slug: requireSlug(parsed.slug),
    pageType: requirePageType(parsed.pageType),
    publishedStatus: requirePublishedStatus(parsed.publishedStatus ?? "draft"),
    sources: parseEvidenceSourceRefs(parsed.sources),
    aliases: parseStringArray(parsed.aliases, "aliases"),
    tags: parseStringArray(parsed.tags, "tags"),
    created: requireString(parsed.created, "created"),
    updated: requireString(parsed.updated, "updated"),
    ...(freshnessSlaDays === undefined ? {} : { freshnessSlaDays }),
  };
}

function assertAllowedKeys(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (!FRONTMATTER_KEYS.has(key)) throw new Error(`disallowed frontmatter key: ${key}`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`missing ${field}`);
  if (/[\u0000-\u001f\u007f]/.test(value) && field !== "created" && field !== "updated") {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function requireSlug(value: unknown): string {
  const slug = requireString(value, "slug");
  if (slug !== slug.trim() || slug.normalize("NFC") !== slug || /[/\\\0]/.test(slug)) {
    throw new Error("slug contains invalid separators or normalization");
  }
  return slug;
}

function requirePageType(value: unknown): WikiPageType {
  if (
    value !== "source" &&
    value !== "concept" &&
    value !== "case" &&
    value !== "guide" &&
    value !== "synthesis"
  ) {
    throw new Error("invalid pageType");
  }
  return value;
}

function requirePublishedStatus(value: unknown): WikiPublishedStatus {
  if (value !== "draft" && value !== "published" && value !== "archived") {
    throw new Error("invalid publishedStatus");
  }
  return value;
}

function parseEvidenceSourceRefs(value: unknown): EvidenceSourceRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("sources must be an array");
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("sources entry must be an object");
    }
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (
        key !== "sourceRevisionId" &&
        key !== "locator" &&
        key !== "effectiveDate" &&
        key !== "confidence"
      ) {
        throw new Error(`disallowed sources key: ${key}`);
      }
    }
    return {
      sourceRevisionId: requireUuid(record.sourceRevisionId),
      locator: requireLocator(record.locator),
      effectiveDate: record.effectiveDate === null ? null : requireIsoDate(record.effectiveDate),
      confidence: requireConfidence(record.confidence),
    };
  });
}

function requireUuid(value: unknown): string {
  const text = requireString(value, "sourceRevisionId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error("invalid sourceRevisionId");
  }
  return text;
}

function requireLocator(value: unknown): string {
  const text = requireString(value, "locator");
  if (text.length > 300 || text !== text.trim()) throw new Error("invalid locator");
  return text;
}

function requireIsoDate(value: unknown): string {
  const text = requireString(value, "effectiveDate");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("invalid effectiveDate");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== text) throw new Error("invalid effectiveDate");
  return text;
}

function requireConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("invalid confidence");
  }
  return value;
}

function parseStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((entry) => requireString(entry, field));
}

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("invalid freshnessSlaDays");
  }
  return value;
}
