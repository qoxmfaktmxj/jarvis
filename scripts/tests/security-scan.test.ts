import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseSecurityScanCliArgs, securityScan } from "../security-scan.js";

describe("securityScan", () => {
  it("fails on forbidden content in exported files and cleans temporary exports", async () => {
    const forbiddenMarker = ["service", "desk"].join("-");
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-"));
    await mkdir(join(sandbox, "config"), { recursive: true });
    await mkdir(join(sandbox, "scripts"), { recursive: true });
    await writeFile(join(sandbox, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(join(sandbox, "scripts", "note.txt"), `contains ${forbiddenMarker} marker`);
    await writeFile(join(sandbox, "config", "public-export-allowlist.json"), JSON.stringify(["scripts", "config", "package.json"]));
    await writeFile(join(sandbox, "config", "public-scan-allowlist.json"), "[]");

    await expect(
      securityScan({ cwd: sandbox })
    ).rejects.toThrow(/forbidden/i);

    const entries = await readFile(join(sandbox, "config", "public-scan-allowlist.json"), "utf8");
    expect(entries).toBe("[]");
    const report = JSON.parse(await readFile(join(sandbox, "artifacts", "security", "local-scan.json"), "utf8"));
    expect(report).toHaveLength(1);
  });

  it("allows only exact public-scan allowlist exceptions", async () => {
    const forbiddenMarker = ["service", "desk"].join("-");
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-allow-"));
    await mkdir(join(sandbox, "config"), { recursive: true });
    await mkdir(join(sandbox, "scripts"), { recursive: true });
    await writeFile(join(sandbox, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(join(sandbox, "scripts", "note.txt"), `contains ${forbiddenMarker} marker`);
    await writeFile(join(sandbox, "config", "public-export-allowlist.json"), JSON.stringify(["scripts", "config", "package.json"]));
    await writeFile(
      join(sandbox, "config", "public-scan-allowlist.json"),
      JSON.stringify([
        {
          ruleId: "forbidden-term",
          path: "scripts/note.txt",
          match: forbiddenMarker,
          reason: "test exception"
        }
      ])
    );

    await expect(securityScan({ cwd: sandbox })).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(join(sandbox, "artifacts", "security", "local-scan.json"), "utf8"))).toEqual([]);
  });

  it("enforces the exact nested Git markers before and after root initialization", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-git-"));
    await mkdir(join(sandbox, ".runtime", "wiki-repo", ".git"), { recursive: true });

    await expect(
      securityScan({ cwd: sandbox, mode: "nested-git", phase: "pre-init" }),
    ).resolves.toBeUndefined();

    await mkdir(join(sandbox, ".git"));
    await expect(
      securityScan({ cwd: sandbox, mode: "nested-git", phase: "post-init" }),
    ).resolves.toBeUndefined();

    await mkdir(join(sandbox, ".runtime", "unexpected", ".git"), { recursive: true });
    await expect(
      securityScan({ cwd: sandbox, mode: "nested-git", phase: "post-init" }),
    ).rejects.toThrow(/unexpected nested Git/i);
  });

  it("rejects export allowlist entries that escape the repository root", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-root-"));
    const outside = await mkdtemp(join(tmpdir(), "jarvis-security-scan-outside-"));
    await mkdir(join(sandbox, "config"), { recursive: true });
    await mkdir(join(sandbox, "scripts"), { recursive: true });
    await writeFile(join(sandbox, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(join(outside, "note.txt"), "outside\n");
    await writeFile(
      join(sandbox, "config", "public-export-allowlist.json"),
      JSON.stringify(["scripts", "config", "package.json", `../${basename(outside)}`]),
    );
    await writeFile(join(sandbox, "config", "public-scan-allowlist.json"), "[]");

    await expect(securityScan({ cwd: sandbox })).rejects.toThrow(/exact string array/i);
  });

  it("rejects allowlist exceptions for credential findings", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-credential-"));
    const credentialKey = ["pass", "word"].join("");
    const credential = `${credentialKey} = "${["synthetic", "secret", "value"].join("")}"`;
    await mkdir(join(sandbox, "config"), { recursive: true });
    await mkdir(join(sandbox, "scripts"), { recursive: true });
    await writeFile(join(sandbox, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(join(sandbox, "scripts", "note.txt"), credential);
    await writeFile(
      join(sandbox, "config", "public-export-allowlist.json"),
      JSON.stringify(["scripts", "config", "package.json"]),
    );
    await writeFile(
      join(sandbox, "config", "public-scan-allowlist.json"),
      JSON.stringify([
        {
          ruleId: "credential-assignment",
          path: "scripts/note.txt",
          match: credential,
          reason: "must not be accepted",
        },
      ]),
    );

    await expect(securityScan({ cwd: sandbox })).rejects.toThrow(/cannot be allowlisted/i);
  });

  it("fully redacts sensitive findings in the report", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-redaction-"));
    const credentialKey = ["pass", "word"].join("");
    const secretValue = ["synthetic", "secret", "value"].join("");
    await mkdir(join(sandbox, "config"), { recursive: true });
    await mkdir(join(sandbox, "scripts"), { recursive: true });
    await writeFile(join(sandbox, "package.json"), "{\"name\":\"demo\"}\n");
    await writeFile(join(sandbox, "scripts", "note.txt"), `${credentialKey} = "${secretValue}"`);
    await writeFile(
      join(sandbox, "config", "public-export-allowlist.json"),
      JSON.stringify(["scripts", "config", "package.json"]),
    );
    await writeFile(join(sandbox, "config", "public-scan-allowlist.json"), "[]");

    await expect(securityScan({ cwd: sandbox })).rejects.toThrow(/forbidden/i);
    const reportText = await readFile(
      join(sandbox, "artifacts", "security", "local-scan.json"),
      "utf8",
    );
    expect(reportText).not.toContain(secretValue);
    expect(JSON.parse(reportText)).toEqual([
      {
        ruleId: "credential-assignment",
        path: "scripts/note.txt",
        match: "<redacted>",
      },
    ]);
  });

  it("rejects a symbolic-link root Git marker", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-root-git-link-"));
    const target = await mkdtemp(join(tmpdir(), "jarvis-security-scan-root-git-target-"));
    await mkdir(join(sandbox, ".runtime", "wiki-repo", ".git"), { recursive: true });
    await symlink(target, join(sandbox, ".git"), "junction");

    await expect(
      securityScan({ cwd: sandbox, mode: "nested-git", phase: "post-init" }),
    ).rejects.toThrow(/root Git marker.*symlink/i);
  });

  it("rejects a file-based root Git marker", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-security-scan-root-git-file-"));
    await mkdir(join(sandbox, ".runtime", "wiki-repo", ".git"), { recursive: true });
    await writeFile(join(sandbox, ".git"), "gitdir: ../outside\n");

    await expect(
      securityScan({ cwd: sandbox, mode: "nested-git", phase: "post-init" }),
    ).rejects.toThrow(/root Git marker.*directory/i);
  });

  it("requires an explicit CLI mode", () => {
    expect(() => parseSecurityScanCliArgs([])).toThrow(/mode.*required/i);
    expect(() => parseSecurityScanCliArgs(["nested-git"])).toThrow(/phase.*required/i);
    expect(parseSecurityScanCliArgs(["content"])).toEqual({ mode: "content" });
    expect(parseSecurityScanCliArgs(["gate"])).toEqual({ mode: "gate" });
    expect(parseSecurityScanCliArgs(["nested-git", "post-init"])).toEqual({
      mode: "nested-git",
      phase: "post-init",
    });
  });
});
