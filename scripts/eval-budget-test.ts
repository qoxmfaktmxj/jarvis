import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export type BudgetEntry = {
  label: string;
  promptTokens: number;
  completionTokens: number;
  maxTotalTokens?: number;
  actualCostUsd?: number;
  maxCostUsd?: number;
};

export type BudgetReport = { violations: string[] };

export function evaluateBudget(entries: BudgetEntry[]): BudgetReport {
  const violations: string[] = [];
  if (entries.length === 0) {
    violations.push("budget input must contain at least one entry");
    return { violations };
  }
  for (const entry of entries) {
    const totalTokens = entry.promptTokens + entry.completionTokens;
    if (entry.maxTotalTokens !== undefined && totalTokens > entry.maxTotalTokens) {
      violations.push(`${entry.label}: total tokens ${totalTokens} exceed ${entry.maxTotalTokens}`);
    }
    if (entry.actualCostUsd !== undefined && entry.maxCostUsd !== undefined && entry.actualCostUsd > entry.maxCostUsd) {
      violations.push(`${entry.label}: cost ${entry.actualCostUsd} exceeds ${entry.maxCostUsd}`);
    }
  }
  return { violations };
}

export async function loadBudgetInput(fileOrStdin?: string): Promise<BudgetEntry[]> {
  if (!fileOrStdin) throw new Error("budget input is required");
  const input = fileOrStdin === "-" ? await readStdin() : await readFile(fileOrStdin, "utf8");
  const parsed: unknown = JSON.parse(input);
  if (Array.isArray(parsed)) return parsed as BudgetEntry[];
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)) {
    return (parsed as { entries: BudgetEntry[] }).entries;
  }
  throw new Error("Budget input must be an array or an object with an entries array");
}

async function readStdin(): Promise<string> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

export async function main(): Promise<void> {
  const inputIndex = process.argv.includes("--fixture")
    ? process.argv.indexOf("--fixture")
    : process.argv.indexOf("--input");
  const input = inputIndex === -1 ? undefined : process.argv[inputIndex + 1];
  if (inputIndex === -1 || !input) throw new Error("--fixture requires a file path or -");
  const report = evaluateBudget(await loadBudgetInput(input));
  if (report.violations.length === 0) return;
  console.error(report.violations.join("\n"));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
