# Public Candidate Security Audit

## Scope

- Local source tree only; no remote is configured.
- Scan date and tool output are recorded under ignored `artifacts/security/` files.
- The root commit SHA is recorded after commit in ignored `artifacts/security/root-commit.txt`.
- Runtime state, generated output, local credentials, and the runtime Wiki Git repository are excluded from the public tree.

## Allowlist policy

- `config/public-export-allowlist.json` is the single source of truth for exported roots.
- `config/public-scan-allowlist.json` is empty for this release.
- Future text exceptions must use the low-risk `forbidden-term` rule and include an exact `ruleId`, `path`, `match`, and written `reason`.
- Credentials, keys, email addresses, network addresses, binary files, and local user paths cannot be allowlisted.

## Functional gates

The final candidate passed:

- `pnpm verify:boundary`
- `pnpm type-check`
- `pnpm lint`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e` (31 tests)
- `pnpm wiki:check`
- `pnpm audit:rsc`
- `pnpm worker:eval`
- `pnpm eval:budget-test --fixture apps/worker/eval/fixtures/public-demo/budget.json`
- clean export, frozen install, local bootstrap, unit tests, type-check, and production build
- `pnpm audit --audit-level high`

The dependency audit has no high or critical findings. It reports two low and four moderate findings below the configured release threshold.

## Secret and leak scans

- Deterministic local scan: `artifacts/security/local-scan.json` is expected to be `[]`.
- Gitleaks 8.30.1: `artifacts/security/gitleaks.json` is expected to contain no findings.
- TruffleHog 3.95.9: `artifacts/security/trufflehog.jsonl` is expected to contain no result rows.
- Scanner image digests are recorded in `artifacts/security/gitleaks-image.txt` and `artifacts/security/trufflehog-image.txt`.

## Git boundary

- `nested-git-pre-init.json`: only `.runtime/wiki-repo/.git`.
- `nested-git-post-init.json`: only `.git` and `.runtime/wiki-repo/.git`.
- `.env.local`, `.runtime`, generated build output, test output, and audit artifacts are ignored and excluded from staging.
- `remotes.txt` must remain empty after the root commit.
