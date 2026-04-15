# TSVD999 Case Pipeline

Phase2 output files are written here.

## 1. Export Oracle TSV

Use UTF-8 and TAB as the delimiter. Provide the JDBC URL through an
environment variable; do not commit internal hostnames or credentials.

```text
jdbc:oracle:thin:@<host>:<port>:<sid>
```

The repository also includes a JDBC chunk exporter. It uses environment
variables for credentials, so do not write passwords into files.
The exporter adds `RN` and `ORACLE_ROWID` columns. `ORACLE_ROWID` becomes the
preferred `source_key`, because TSVD999 `SEQ` is not globally unique. The
exporter also replaces CR/LF inside CLOB text with spaces so each TSVD999 row
stays one physical TSV line.

```powershell
javac -encoding UTF-8 `
  -cp "C:\EHR_PROJECT\isu-hr\EHR_HR50\target\mvn-lib\ojdbc8-21.5.0.0.jar" `
  scripts\ExportTsvd999Chunk.java

$env:ORACLE_USER="<schema_user>"
$env:ORACLE_PASSWORD="<password>"
$env:ORACLE_JDBC_URL="jdbc:oracle:thin:@<host>:<port>:<sid>"
$env:ORACLE_TABLE="<schema>.TSVD999" # optional; defaults to TSVD999 for the connected schema

java -cp "scripts;C:\EHR_PROJECT\isu-hr\EHR_HR50\target\mvn-lib\ojdbc8-21.5.0.0.jar" `
  ExportTsvd999Chunk `
  --start 1 `
  --end 1000 `
  --output data\cases\chunks\tsvd999_000001_001000.tsv
```

For the full pipeline, use the wrapper script:

```powershell
.\scripts\extract-all-chunks.ps1
```

Recommended query:

```sql
SELECT
  ROWID AS ORACLE_ROWID,
  ENTER_CD, YYYY, MM, SEQ,
  HIGHER_CD, HIGHER_NM, LOWER_CD, LOWER_NM,
  STATUS_CD, STATUS_NM, PROCESS_SPEED,
  TITLE,
  REQUEST_COMPANY_CD, REQUEST_COMPANY_NM,
  REQUEST_DEPT_NM, REQUEST_NM,
  REGISTER_DATE,
  APP_MENU,
  MANAGER_NM, MANAGER_DEPT_NM,
  RECEIPT_DATE, BUSINESS_LEVEL,
  COMPLETE_RESERVE_DATE, SOLUTION_FLAG,
  WORK_TIME, COMPLETE_DATE,
  PROCESS_CD, PROCESS_NM,
  VALUATION,
  GUBUN_CD, DELETE_FLAG,
  DBMS_LOB.SUBSTR(CONTENT, 4000, 1) AS CONTENT_TEXT,
  DBMS_LOB.SUBSTR(COMPLETE_CONTENT, 4000, 1) AS COMPLETE_TEXT,
  COMPLETE_CONTENT1
FROM <schema>.TSVD999
WHERE NVL(DELETE_FLAG, 'N') <> 'Y'
ORDER BY
  YYYY DESC NULLS LAST,
  MM DESC NULLS LAST,
  ENTER_CD NULLS LAST,
  SEQ NULLS LAST,
  ROWID;
```

## 2. Normalize

```powershell
py -m pip install -r scripts/requirements-tsvd999.txt
py scripts/normalize-tsvd999.py `
  --input data/cases/tsvd999_export.tsv `
  --output data/cases/normalized_cases.jsonl `
  --mode heuristic `
  --resume
```

If an older `normalized_cases.jsonl` starts with a source key like
`SSMS/2026/04/3`, regenerate the normalized/cluster files before continuing.
Current files should use `tsvd999/rowid/...` or `tsvd999/rn/...`.

## 3. Cluster

```powershell
py scripts/cluster-cases.py `
  --input data/cases/normalized_cases.jsonl `
  --output data/cases/clusters.json `
  --cases-output data/cases/normalized_cases.clustered.jsonl `
  --method fallback
```

## 4. Import

Run Phase0 schema migration first so `precedent_case` and `case_cluster` exist.

```powershell
pnpm exec tsx scripts/import-cases-to-jarvis.ts `
  --workspace-id <workspace_uuid> `
  --cases data/cases/normalized_cases.clustered.jsonl `
  --clusters data/cases/clusters.json `
  --create-digests
```
