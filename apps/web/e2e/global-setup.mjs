import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

function ensureSyntheticCredentials() {
  for (const role of ["ADMIN", "EDITOR", "TARGET"]) {
    process.env[`PLAYWRIGHT_${role}_EMAIL`] ??= `e2e-${role.toLowerCase()}@example.invalid`;
    process.env[`PLAYWRIGHT_${role}_PASSWORD`] ??=
      `E2e-${role}-${randomBytes(24).toString("base64url")}`;
  }
}

export default async function globalSetup() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Playwright global setup is disabled in production");
  }
  ensureSyntheticCredentials();
  const webRoot = fileURLToPath(new URL("../", import.meta.url));
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "e2e/seed-fixtures.ts"],
      { cwd: webRoot, env: process.env, stdio: "inherit", shell: false },
    );
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Playwright fixture seed failed with exit code ${code ?? -1}`));
    });
  });
}
