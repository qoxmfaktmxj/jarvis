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
  { kind: "ssn", regex: /\d{6}-\d{7}/g, replacement: "[REDACTED_SSN]" },
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
