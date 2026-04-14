export type PiiKind = "ssn" | "phone" | "email" | "card";

export interface PiiHit {
  kind: PiiKind;
  span: [number, number];
  replacement: string;
}

export interface RedactResult {
  redacted: string;
  hits: PiiHit[];
}

interface PatternDef {
  kind: PiiKind;
  regex: RegExp;
  replacement: string;
}

const PATTERNS: PatternDef[] = [
  {
    kind: "ssn",
    // Korean resident registration number: YYMMDD-GNNNNNNC
    // Validate month (01-12) and day (01-31) to reduce false positives on order
    // numbers, date ranges, etc.  Boundary anchors prevent matching inside longer
    // digit runs (e.g. 12-digit order numbers).
    regex:
      /(?<!\d)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-\d{7}(?!\d)/g,
    replacement: "[REDACTED_SSN]",
  },
  {
    kind: "phone",
    regex: /\b01[0-9]-\d{3,4}-\d{4}\b|\b02-\d{3,4}-\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    kind: "email",
    regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    kind: "card",
    regex: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g,
    replacement: "[REDACTED_CARD]",
  },
];

export function redactPII(text: string): RedactResult {
  const hits: PiiHit[] = [];
  let redacted = text;
  // Collect all hits across patterns, sort by span start DESC, then splice replace
  const allMatches: Array<PiiHit> = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.regex)) {
      const start = m.index ?? 0;
      allMatches.push({
        kind: p.kind,
        span: [start, start + m[0].length],
        replacement: p.replacement,
      });
    }
  }
  // Deduplicate by span (later patterns may overlap earlier ones — keep first/longest)
  allMatches.sort((a, b) => a.span[0] - b.span[0]);
  const nonOverlap: PiiHit[] = [];
  let cursor = -1;
  for (const h of allMatches) {
    if (h.span[0] >= cursor) {
      nonOverlap.push(h);
      cursor = h.span[1];
    }
  }
  // Apply in reverse
  for (const h of [...nonOverlap].reverse()) {
    redacted =
      redacted.slice(0, h.span[0]) + h.replacement + redacted.slice(h.span[1]);
  }
  hits.push(...nonOverlap);
  return { redacted, hits };
}

const SECRET_KEYWORDS = [
  "비밀번호",
  "password",
  "api_key",
  "secret_key",
  "private_key",
] as const;

export type Sensitivity =
  | "PUBLIC"
  | "INTERNAL"
  | "RESTRICTED"
  | "SECRET_REF_ONLY";

export function detectSecretKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const kw of SECRET_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) hits.add(kw);
  }
  return [...hits];
}

const ORDER: Record<Sensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  RESTRICTED: 2,
  SECRET_REF_ONLY: 3,
};

export function computeSensitivity(
  text: string,
  callerDefault: Sensitivity,
): Sensitivity {
  if (detectSecretKeywords(text).length > 0) return "SECRET_REF_ONLY";
  const { hits } = redactPII(text);
  if (hits.length > 0) {
    return ORDER[callerDefault] >= ORDER.INTERNAL ? callerDefault : "INTERNAL";
  }
  return callerDefault;
}
