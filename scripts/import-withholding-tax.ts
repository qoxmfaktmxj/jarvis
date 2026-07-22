import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pathExists } from "./fs-utils.js";

const SOURCE_FILE = "withholding-tax-verified-facts.json";
const OFFICIAL_DOMAINS = [
  "law.go.kr",
  "nts.go.kr",
  "hometax.go.kr",
  "moef.go.kr",
  "moel.go.kr",
  "mohw.go.kr",
  "korea.kr",
  "nps.or.kr",
  "taxlaw.nts.go.kr",
  "open.law.go.kr",
] as const;

interface WithholdingFact {
  id: string;
  slug: string;
  title: string;
  chapter: string;
  claim: string;
  lawRef: string;
  lawUrl: string;
  asOf: string;
  effectiveDate?: string;
  verifyStatus: string;
  primarySourceVerified?: boolean;
  confidenceScore?: number;
  scopeLimitations?: string;
  risk?: string;
  sourceTitle?: string;
  nextReviewBy?: string;
}

export interface ImportWithholdingTaxOptions {
  sourceRoot: string;
  outputRoot?: string;
  sourceRevision: string;
}

export interface ImportWithholdingTaxResult {
  total: number;
  imported: number;
  excluded: number;
}

function isOfficialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && OFFICIAL_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function isImportable(fact: WithholdingFact): boolean {
  return fact.verifyStatus === "확정" &&
    fact.primarySourceVerified === true &&
    Boolean(fact.lawRef?.trim()) &&
    isOfficialUrl(fact.lawUrl);
}

function pageSlug(fact: WithholdingFact): string {
  const normalized = fact.slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = fact.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!normalized || !id) throw new Error(`invalid fact slug: ${fact.id}`);
  return `withholding-${normalized}-${id}`;
}

function sourceLocator(fact: WithholdingFact): string {
  return `fact-${fact.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function isoDate(value: string | undefined, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : fallback;
}

function oneLine(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function confidence(fact: WithholdingFact): number {
  const score = Number(fact.confidenceScore);
  if (!Number.isFinite(score)) return 1;
  return Math.max(0, Math.min(1, score / 100));
}

function renderPage(fact: WithholdingFact, sourceRevision: string): string {
  const slug = pageSlug(fact);
  const effectiveDate = isoDate(fact.effectiveDate, fact.asOf);
  const review = fact.nextReviewBy ? `\n- 다음 검토일: ${fact.nextReviewBy}` : "";
  const limitations = oneLine(fact.scopeLimitations) || "개별 사실관계와 최신 개정 여부를 별도로 확인해야 한다.";
  const freshness = fact.risk === "high" ? 90 : fact.risk === "medium" ? 180 : 365;
  return `---
title: ${JSON.stringify(oneLine(fact.title))}
slug: ${slug}
pageType: guide
publishedStatus: published
sources:
  - sourceRevisionId: "{{sourceRevisionId:${SOURCE_FILE}}}"
    locator: ${sourceLocator(fact)}
    effectiveDate: ${effectiveDate}
    confidence: ${confidence(fact)}
aliases: [${JSON.stringify(oneLine(fact.lawRef))}]
tags: [withholding-tax, ${fact.chapter}, ${fact.risk || "unspecified"}]
created: ${fact.asOf}T00:00:00.000Z
updated: ${fact.asOf}T00:00:00.000Z
freshnessSlaDays: ${freshness}
---
# ${oneLine(fact.title)}

${oneLine(fact.claim)}

## 근거와 적용 범위

- 법적 근거: ${oneLine(fact.lawRef)}
- 공식 출처: [원문 확인](${fact.lawUrl})
- 자료 기준일: ${fact.asOf}
- 적용 기준일: ${effectiveDate}${review}
- 적용 범위·주의: ${limitations}

## 검증 이력

- 원천 데이터: [withhold-tax \`${sourceRevision}\`](https://github.com/qoxmfaktmxj/withhold-tax/blob/${sourceRevision}/content/facts.json)
- 포함 기준: 확정, 1차 출처 검증 완료, 정부·공공기관 공식 URL

> 이 문서는 업무 참고용이며 법률·세무 자문이 아닙니다. 실제 처리 전 최신 법령과 과세관청 안내를 다시 확인하세요.
`;
}

function normalizedParagraph(fact: WithholdingFact): string {
  return [
    sourceLocator(fact),
    `원천 slug: ${fact.slug}`,
    `제목: ${oneLine(fact.title)}`,
    `주장: ${oneLine(fact.claim)}`,
    `법적 근거: ${oneLine(fact.lawRef)}`,
    `공식 출처: ${fact.lawUrl}`,
    `자료 기준일: ${fact.asOf}`,
    `적용 기준일: ${isoDate(fact.effectiveDate, fact.asOf)}`,
    `적용 범위·주의: ${oneLine(fact.scopeLimitations) || "개별 사실관계 확인 필요"}`,
  ].join("\n");
}

export async function importWithholdingTax({
  sourceRoot,
  outputRoot = process.cwd(),
  sourceRevision,
}: ImportWithholdingTaxOptions): Promise<ImportWithholdingTaxResult> {
  if (!/^[0-9a-f]{6,40}$/i.test(sourceRevision)) throw new Error("invalid source revision");
  const factsPath = join(resolve(sourceRoot), "content", "facts.json");
  const parsed = JSON.parse(await readFile(factsPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("facts.json must be an array");
  const facts = (parsed as WithholdingFact[]).filter(isImportable).sort(
    (left, right) => left.chapter.localeCompare(right.chapter) || left.id.localeCompare(right.id),
  );
  const slugs = facts.map(pageSlug);
  if (new Set(slugs).size !== slugs.length) throw new Error("duplicate generated Wiki slug");

  const pagesRoot = join(resolve(outputRoot), "samples", "wiki", "manual", "notes", "withholding-tax");
  const sourcesRoot = join(resolve(outputRoot), "samples", "sources");
  await mkdir(pagesRoot, { recursive: true });
  await mkdir(sourcesRoot, { recursive: true });
  const expectedFiles = new Set(slugs.map((slug) => `${slug}.md`));
  if (await pathExists(pagesRoot)) {
    const stale = (await readdir(pagesRoot)).filter((name) => name.endsWith(".md") && !expectedFiles.has(name));
    if (stale.length > 0) throw new Error(`stale generated Wiki pages: ${stale.join(", ")}`);
  }

  const canonicalUrl = `https://github.com/qoxmfaktmxj/withhold-tax/blob/${sourceRevision}/content/facts.json`;
  const snapshotDate = facts.reduce((latest, fact) => fact.asOf > latest ? fact.asOf : latest, "2026-01-01");
  const snapshot = {
    revisionKey: sourceRevision,
    publishedAt: snapshotDate,
    effectiveFrom: snapshotDate,
    provenance: {
      repository: "https://github.com/qoxmfaktmxj/withhold-tax",
      revision: sourceRevision,
      canonicalUrl,
      importedAt: "2026-07-22",
      criteria: "verifyStatus=확정, primarySourceVerified=true, official HTTPS lawUrl",
    },
    factCount: facts.length,
    facts: facts.map((fact) => ({
      id: fact.id,
      slug: fact.slug,
      title: oneLine(fact.title),
      chapter: fact.chapter,
      claim: oneLine(fact.claim),
      lawRef: oneLine(fact.lawRef),
      lawUrl: fact.lawUrl,
      asOf: fact.asOf,
      effectiveDate: isoDate(fact.effectiveDate, fact.asOf),
      confidenceScore: fact.confidenceScore ?? 100,
      risk: fact.risk ?? "unspecified",
      scopeLimitations: oneLine(fact.scopeLimitations),
      nextReviewBy: fact.nextReviewBy ?? "",
    })),
    normalizedText: facts.map(normalizedParagraph).join("\n\n"),
  };
  await writeFile(join(sourcesRoot, SOURCE_FILE), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  for (let index = 0; index < facts.length; index += 1) {
    await writeFile(join(pagesRoot, `${slugs[index]}.md`), renderPage(facts[index]!, sourceRevision), "utf8");
  }
  return { total: parsed.length, imported: facts.length, excluded: parsed.length - facts.length };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function main(): Promise<void> {
  const sourceRoot = argument("--source");
  const sourceRevision = argument("--revision");
  if (!sourceRoot || !sourceRevision) {
    throw new Error("usage: pnpm knowledge:import-withholding-tax -- --source <path> --revision <git-sha>");
  }
  const result = await importWithholdingTax({ sourceRoot, sourceRevision });
  console.log(`withholding-tax imported: ${result.imported}/${result.total} (excluded ${result.excluded})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "withholding-tax import failed");
    process.exitCode = 1;
  });
}
