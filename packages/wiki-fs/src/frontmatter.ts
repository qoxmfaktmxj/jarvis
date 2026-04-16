/**
 * YAML frontmatter parser + serializer with round-trip guarantees for
 * Korean strings, escape-containing titles, and array fields (aliases,
 * linkedPages, tags, sources).
 *
 * We use `yaml@^2` directly instead of `gray-matter` for serialization
 * because gray-matter's underlying `js-yaml` default flow choices break on
 * embedded double quotes (see R-W1T1-2 in the integration plan).
 *
 * Parsing still goes through `yaml`'s permissive mode so hand-edited pages
 * (manual area) with non-canonical layouts still load.
 */

import YAML from "yaml";

import type {
  WikiAuthority,
  WikiFrontmatter,
  WikiPageType,
  WikiSensitivity,
} from "./types.js";

const FRONTMATTER_OPEN = "---";
const FRONTMATTER_CLOSE = "---";

const VALID_TYPES: readonly WikiPageType[] = [
  "source",
  "entity",
  "concept",
  "synthesis",
  "derived",
];
const VALID_SENSITIVITIES: readonly WikiSensitivity[] = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY",
];
const VALID_AUTHORITIES: readonly WikiAuthority[] = ["auto", "manual"];

/**
 * Split a markdown document into `{ frontmatter, body }` without parsing
 * the YAML. Returns `frontmatter: null` when the document has no
 * frontmatter block.
 *
 * Accepts both `\n---\n` and `\r\n---\r\n` terminators for Windows-edited
 * files that slipped in via manual authoring.
 */
export function splitFrontmatter(source: string): {
  frontmatter: string | null;
  body: string;
} {
  // Only treat the document as frontmatter-bearing when it opens with --- on
  // the very first line. Inline --- inside code blocks later in the doc
  // shouldn't trigger.
  const normalized = source.replace(/^\uFEFF/, "");
  if (!normalized.startsWith(`${FRONTMATTER_OPEN}\n`) && !normalized.startsWith(`${FRONTMATTER_OPEN}\r\n`)) {
    return { frontmatter: null, body: source };
  }
  const afterOpen = normalized.slice(FRONTMATTER_OPEN.length + 1); // past first newline
  // Find a closing `---` that sits on its own line.
  const closeRegex = /\r?\n---(\r?\n|$)/;
  const match = closeRegex.exec(afterOpen);
  if (!match) {
    return { frontmatter: null, body: source };
  }
  const frontmatter = afterOpen.slice(0, match.index);
  const body = afterOpen.slice(match.index + match[0].length);
  return { frontmatter, body };
}

/**
 * Parse frontmatter + body out of a markdown document. Missing fields are
 * filled with schema-safe defaults so callers can assume the returned
 * `data` is always complete. Unknown keys pass through unchanged.
 *
 * Throws when:
 *  - The YAML itself is malformed.
 *  - `type` / `sensitivity` / `authority` contain values outside the enum.
 *
 * Does not throw for missing `title` / `workspaceId` — callers validate
 * domain constraints separately (some ingest intermediates intentionally
 * write incomplete frontmatter while processing).
 */
export function parseFrontmatter(source: string): {
  data: WikiFrontmatter;
  body: string;
} {
  const { frontmatter, body } = splitFrontmatter(source);
  if (frontmatter === null) {
    return { data: defaultFrontmatter(), body };
  }

  const raw = YAML.parse(frontmatter) as Record<string, unknown> | null;
  if (raw === null || typeof raw !== "object") {
    return { data: defaultFrontmatter(), body };
  }

  const data = coerceFrontmatter(raw);
  return { data, body };
}

/**
 * Serialize frontmatter + body back into a markdown document with a
 * deterministic field order. Round-trip invariant:
 *
 *   parseFrontmatter(serializeFrontmatter(data, body)) ≅ { data, body }
 *
 * where `≅` means identical for known fields (unknown keys also preserved).
 */
export function serializeFrontmatter(
  data: Partial<WikiFrontmatter> & { [key: string]: unknown },
  body: string,
): string {
  const ordered = orderFields(data);
  // YAML.stringify with explicit options keeps Korean / quote-containing
  // strings as plain when safe and quoted only when necessary.
  const yamlText = YAML.stringify(ordered, {
    // Force block style for arrays so linkedPages/aliases render as lists
    // rather than flow `[a, b]` which is harder to diff.
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
    singleQuote: false,
    lineWidth: 0,
  }).trimEnd();

  // The closing `---` sits on its own line; `splitFrontmatter` consumes
  // the newline right after it, so we do *not* add an extra leading
  // newline to the body. Callers that want blank-line separation should
  // start their body with `\n`.
  return `${FRONTMATTER_OPEN}\n${yamlText}\n${FRONTMATTER_CLOSE}\n${body}`;
}

/**
 * Build a frontmatter object populated with schema-safe defaults. Useful
 * when seeding a new page and the caller wants to set only a subset of
 * fields.
 */
export function defaultFrontmatter(): WikiFrontmatter {
  const now = new Date().toISOString();
  return {
    title: "",
    type: "concept",
    workspaceId: "",
    sensitivity: "INTERNAL",
    requiredPermission: "knowledge:read",
    sources: [],
    aliases: [],
    tags: [],
    created: now,
    updated: now,
    authority: "auto",
    linkedPages: [],
  };
}

// ── internal helpers ───────────────────────────────────────────────────

const KNOWN_FIELDS: readonly (keyof WikiFrontmatter)[] = [
  "title",
  "type",
  "workspaceId",
  "sensitivity",
  "requiredPermission",
  "sources",
  "aliases",
  "tags",
  "created",
  "updated",
  "authority",
  "linkedPages",
  "freshnessSlaDays",
];

function orderFields(
  data: Partial<WikiFrontmatter> & { [key: string]: unknown },
): Record<string, unknown> {
  const merged = { ...defaultFrontmatter(), ...data };
  const ordered: Record<string, unknown> = {};
  for (const key of KNOWN_FIELDS) {
    ordered[key] = merged[key];
  }
  // Preserve unknown (future) keys at the tail in insertion order.
  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.includes(key as keyof WikiFrontmatter)) {
      ordered[key] = data[key];
    }
  }
  return ordered;
}

function coerceFrontmatter(raw: Record<string, unknown>): WikiFrontmatter {
  const defaults = defaultFrontmatter();
  const typeValue = isEnumMember(raw.type, VALID_TYPES)
    ? raw.type
    : defaults.type;
  const sensitivityValue = isEnumMember(raw.sensitivity, VALID_SENSITIVITIES)
    ? raw.sensitivity
    : defaults.sensitivity;
  const authorityValue = isEnumMember(raw.authority, VALID_AUTHORITIES)
    ? raw.authority
    : defaults.authority;

  // Validate enum-bearing fields explicitly — if a caller wrote an invalid
  // enum value on disk we surface it loudly so ingest's validate step can
  // route to ingest_dlq.
  if (raw.type !== undefined && !isEnumMember(raw.type, VALID_TYPES)) {
    throw new Error(
      `Invalid frontmatter.type: ${JSON.stringify(raw.type)} (expected ${VALID_TYPES.join("|")})`,
    );
  }
  if (raw.sensitivity !== undefined && !isEnumMember(raw.sensitivity, VALID_SENSITIVITIES)) {
    throw new Error(
      `Invalid frontmatter.sensitivity: ${JSON.stringify(raw.sensitivity)} (expected ${VALID_SENSITIVITIES.join("|")})`,
    );
  }
  if (raw.authority !== undefined && !isEnumMember(raw.authority, VALID_AUTHORITIES)) {
    throw new Error(
      `Invalid frontmatter.authority: ${JSON.stringify(raw.authority)} (expected ${VALID_AUTHORITIES.join("|")})`,
    );
  }

  const data: WikiFrontmatter = {
    ...defaults,
    title: stringOr(raw.title, defaults.title),
    type: typeValue,
    workspaceId: stringOr(raw.workspaceId, defaults.workspaceId),
    sensitivity: sensitivityValue,
    requiredPermission: stringOr(raw.requiredPermission, defaults.requiredPermission),
    sources: stringArrayOr(raw.sources, defaults.sources),
    aliases: stringArrayOr(raw.aliases, defaults.aliases),
    tags: stringArrayOr(raw.tags, defaults.tags),
    created: stringOr(raw.created, defaults.created),
    updated: stringOr(raw.updated, defaults.updated),
    authority: authorityValue,
    linkedPages: stringArrayOr(raw.linkedPages, defaults.linkedPages),
    freshnessSlaDays: numberOrUndefined(raw.freshnessSlaDays),
  };

  // Pass through unknown fields intact for round-trip safety.
  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.includes(key as keyof WikiFrontmatter)) {
      data[key] = raw[key];
    }
  }

  return data;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

function isEnumMember<T extends string>(
  value: unknown,
  members: readonly T[],
): value is T {
  return typeof value === "string" && (members as readonly string[]).includes(value);
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}
