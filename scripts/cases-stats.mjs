import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ROOT = process.cwd();
const JSONL = path.join(ROOT, "data/cases/normalized_cases.clustered.jsonl");
const CLUSTERS = path.join(ROOT, "data/cases/clusters.json");
const OUT_JSON = path.join(ROOT, "data/cases/stats.json");
const OUT_MD = path.join(ROOT, "data/cases/stats.md");

function bumpCounter(map, key, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
}
function bumpMatrix(map, rowKey, colKey, by = 1) {
  if (!rowKey || !colKey) return;
  if (!map.has(rowKey)) map.set(rowKey, new Map());
  bumpCounter(map.get(rowKey), colKey, by);
}
function topN(counter, n = 30) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}
function quartiles(arr) {
  if (arr.length === 0) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9), p99: at(0.99), max: s[s.length - 1] };
}

const stats = {
  totalRows: 0,
  byHigher: new Map(),
  byLower: new Map(),
  byHigherLower: new Map(),
  byCompany: new Map(),
  byProcessType: new Map(),
  byManagerTeam: new Map(),
  bySeverity: new Map(),
  byUrgency: new Map(),
  byResolved: new Map(),
  bySensitivity: new Map(),
  companyByModule: new Map(),
  symptomLens: [],
  actionLens: [],
  workHours: [],
  resolutionDays: [],
  bySourceCount: new Map(),
  withAction: 0,
  withoutAction: 0,
  withCause: 0,
  cluster: { sizes: [] },
  byMonth: new Map(),
};

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(JSONL, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    stats.totalRows++;

    const higher = r.higher_category || "";
    const lower = r.lower_category || "";
    const company = r.request_company || "(unknown)";

    bumpCounter(stats.byHigher, higher);
    bumpCounter(stats.byLower, lower);
    bumpCounter(stats.byHigherLower, higher && lower ? `${higher} / ${lower}` : higher || lower);
    bumpCounter(stats.byCompany, company);
    bumpCounter(stats.byProcessType, r.process_type || "");
    bumpCounter(stats.byManagerTeam, r.manager_team || "");
    bumpCounter(stats.bySeverity, String(r.severity ?? ""));
    bumpCounter(stats.byUrgency, String(r.urgency ?? ""));
    bumpCounter(stats.byResolved, String(r.resolved ?? ""));
    bumpCounter(stats.bySensitivity, r.sensitivity || "");
    bumpMatrix(stats.companyByModule, higher || "(unknown)", company);

    if (r.symptom) stats.symptomLens.push(r.symptom.length);
    if (r.action) {
      stats.actionLens.push(r.action.length);
      stats.withAction++;
    } else {
      stats.withoutAction++;
    }
    if (r.cause) stats.withCause++;
    if (typeof r.work_hours === "number") stats.workHours.push(r.work_hours);

    if (r.requested_at && r.resolved_at) {
      const d = (new Date(r.resolved_at) - new Date(r.requested_at)) / 86400000;
      if (Number.isFinite(d) && d >= 0 && d < 365) stats.resolutionDays.push(d);
    }
    if (r.requested_at) {
      const ym = String(r.requested_at).slice(0, 7);
      if (ym.length === 7) bumpCounter(stats.byMonth, ym);
    }
  }

  let clustersFile = null;
  try { clustersFile = JSON.parse(fs.readFileSync(CLUSTERS, "utf8")); } catch {}
  if (clustersFile) {
    for (const k of Object.keys(clustersFile)) {
      const c = clustersFile[k];
      if (typeof c?.case_count === "number") stats.cluster.sizes.push(c.case_count);
    }
  }

  const out = {
    totalRows: stats.totalRows,
    coverage: {
      withAction: stats.withAction,
      withoutAction: stats.withoutAction,
      withCause: stats.withCause,
      symptomLen: quartiles(stats.symptomLens),
      actionLen: quartiles(stats.actionLens),
      workHours: quartiles(stats.workHours),
      resolutionDays: quartiles(stats.resolutionDays),
    },
    distribution: {
      higher: topN(stats.byHigher, 30),
      lower: topN(stats.byLower, 30),
      higherLower: topN(stats.byHigherLower, 50),
      company: topN(stats.byCompany, 50),
      processType: topN(stats.byProcessType, 30),
      managerTeam: topN(stats.byManagerTeam, 30),
      severity: topN(stats.bySeverity, 20),
      urgency: topN(stats.byUrgency, 20),
      resolved: topN(stats.byResolved, 20),
      sensitivity: topN(stats.bySensitivity, 20),
      monthly: topN(stats.byMonth, 60).sort((a, b) => a.key.localeCompare(b.key)),
    },
    cluster: {
      total: stats.cluster.sizes.length,
      sizes: quartiles(stats.cluster.sizes),
      top10ByCount:
        clustersFile
          ? Object.values(clustersFile)
              .sort((a, b) => (b.case_count ?? 0) - (a.case_count ?? 0))
              .slice(0, 10)
              .map((c) => ({
                cluster_id: c.cluster_id,
                label: c.label,
                case_count: c.case_count,
              }))
          : [],
    },
    companyByModule: [...stats.companyByModule.entries()]
      .map(([mod, m]) => ({
        module: mod,
        total: [...m.values()].reduce((a, b) => a + b, 0),
        topCompanies: topN(m, 5),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20),
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

  const md = [];
  md.push(`# TSVD999 Cases — Stats\n`);
  md.push(`**Total rows:** ${out.totalRows.toLocaleString()}`);
  md.push(`**With action:** ${out.coverage.withAction.toLocaleString()} (${((out.coverage.withAction / out.totalRows) * 100).toFixed(1)}%)`);
  md.push(`**Without action:** ${out.coverage.withoutAction.toLocaleString()}`);
  md.push(`**With cause:** ${out.coverage.withCause.toLocaleString()}\n`);

  md.push(`## Length distribution`);
  md.push(`| Field | p10 | p50 | p90 | p99 | max |`);
  md.push(`|---|---:|---:|---:|---:|---:|`);
  const q = (x) => x ? `${x.p10} | ${x.p50} | ${x.p90} | ${x.p99} | ${x.max}` : "—";
  md.push(`| symptom (chars) | ${q(out.coverage.symptomLen)} |`);
  md.push(`| action (chars) | ${q(out.coverage.actionLen)} |`);
  md.push(`| work_hours | ${q(out.coverage.workHours)} |`);
  md.push(`| resolution_days | ${q(out.coverage.resolutionDays)} |\n`);

  md.push(`## Top 모듈 (HIGHER × LOWER) — top 30`);
  md.push(`| 모듈 | 건수 |`); md.push(`|---|---:|`);
  out.distribution.higherLower.slice(0, 30).forEach((r) => md.push(`| ${r.key} | ${r.count.toLocaleString()} |`));
  md.push(``);

  md.push(`## Top 회사 — top 30`);
  md.push(`| 회사 | 건수 |`); md.push(`|---|---:|`);
  out.distribution.company.slice(0, 30).forEach((r) => md.push(`| ${r.key} | ${r.count.toLocaleString()} |`));
  md.push(``);

  md.push(`## Top process type`);
  md.push(`| 처리 유형 | 건수 |`); md.push(`|---|---:|`);
  out.distribution.processType.slice(0, 20).forEach((r) => md.push(`| ${r.key} | ${r.count.toLocaleString()} |`));
  md.push(``);

  md.push(`## Cluster summary`);
  md.push(`Total clusters: **${out.cluster.total}**`);
  md.push(`Sizes (cases per cluster): p10=${out.cluster.sizes?.p10}, p50=${out.cluster.sizes?.p50}, p90=${out.cluster.sizes?.p90}, max=${out.cluster.sizes?.max}\n`);
  md.push(`### Top 10 clusters by size`);
  md.push(`| id | label | cases |`); md.push(`|---|---|---:|`);
  out.cluster.top10ByCount.forEach((c) => md.push(`| ${c.cluster_id} | ${c.label} | ${c.case_count} |`));
  md.push(``);

  md.push(`## Monthly volume`);
  md.push(`| 월 | 건수 |`); md.push(`|---|---:|`);
  out.distribution.monthly.forEach((r) => md.push(`| ${r.key} | ${r.count.toLocaleString()} |`));
  md.push(``);

  md.push(`## 회사 × 모듈 (top 모듈 20개, 각 모듈의 top 5 회사)`);
  out.companyByModule.forEach((m) => {
    md.push(`- **${m.module}** (${m.total.toLocaleString()}): ${m.topCompanies.map((c) => `${c.key}(${c.count})`).join(", ")}`);
  });

  fs.writeFileSync(OUT_MD, md.join("\n"));
  console.log(`stats written: ${OUT_JSON}, ${OUT_MD}`);
  console.log(`totalRows=${out.totalRows}, clusters=${out.cluster.total}, top company=${out.distribution.company[0]?.key}, top module=${out.distribution.higherLower[0]?.key}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
