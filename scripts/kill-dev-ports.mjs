#!/usr/bin/env node
/**
 * scripts/kill-dev-ports.mjs
 *
 * Free the ports used by `pnpm dev` (Next.js 3010 + worker healthcheck 9090)
 * when a previous run left orphan node processes listening. Safe to call
 * even when the ports are idle.
 *
 * Usage:
 *   node scripts/kill-dev-ports.mjs           # defaults: 3010, 9090
 *   node scripts/kill-dev-ports.mjs 3010 9090 8080
 *
 * Intended workflow:
 *   pnpm dev:clean && pnpm dev
 */

import { execSync } from "node:child_process";

const DEFAULT_PORTS = [3010, 9090];
const ports = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map((p) => parseInt(p, 10)).filter((n) => Number.isFinite(n) && n > 0)
  : DEFAULT_PORTS;

const isWin = process.platform === "win32";

for (const port of ports) {
  try {
    if (isWin) {
      // PowerShell: ignore "no listener" as non-error. OwningProcess can be null
      // when the port is free; the Where-Object filters those out.
      execSync(
        `powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $p = (Get-NetTCPConnection -State Listen -LocalPort ${port}).OwningProcess | Where-Object { $_ } ; if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force } ; Write-Host 'killed' $p } else { Write-Host 'idle' }"`,
        { stdio: "inherit" },
      );
    } else {
      // Unix: lsof returns non-zero when no match — route through `|| true`.
      execSync(
        `sh -c "pids=$(lsof -ti:${port} || true); if [ -n \\"$pids\\" ]; then kill -9 $pids && echo killed $pids; else echo idle; fi"`,
        { stdio: "inherit" },
      );
    }
    console.log(`[kill-dev-ports] :${port} processed`);
  } catch (err) {
    console.warn(`[kill-dev-ports] :${port} cleanup failed (likely harmless):`, err.message);
  }
}
