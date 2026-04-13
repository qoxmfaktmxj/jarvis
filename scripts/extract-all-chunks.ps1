#!/usr/bin/env pwsh
# scripts/extract-all-chunks.ps1
# Export TSVD999 chunks, normalize them with the heuristic pipeline, then cluster.
#
# Usage:
#   $env:ORACLE_USER = "<schema_user>"
#   $env:ORACLE_PASSWORD = "<password>"
#   $env:ORACLE_JDBC_URL = "jdbc:oracle:thin:@<host>:<port>:<sid>"
#   .\scripts\extract-all-chunks.ps1

param(
    [int]$StartChunk = 1,
    [int]$EndChunk = 125,
    [switch]$SkipExtract,
    [switch]$SkipNormalize,
    [switch]$SkipCluster,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$CHUNKS_DIR = Join-Path $ROOT "data\cases\chunks"
$CASES_DIR = Join-Path $ROOT "data\cases"
$OJDBC_JAR = "C:\EHR_PROJECT\isu-hr\EHR_HR50\target\mvn-lib\ojdbc8-21.5.0.0.jar"
$SCRIPTS_DIR = Join-Path $ROOT "scripts"

$NORMALIZED_JSONL = Join-Path $CASES_DIR "normalized_cases.jsonl"
$CLUSTERS_JSON = Join-Path $CASES_DIR "clusters.json"
$CLUSTERED_JSONL = Join-Path $CASES_DIR "normalized_cases.clustered.jsonl"
$TOTAL_ROWS = 124232
$CHUNK_SIZE = 1000
$EXPECTED_TSV_HEADER = "RN`tORACLE_ROWID`tENTER_CD`tYYYY`tMM`tSEQ`tHIGHER_CD`tHIGHER_NM`tLOWER_CD`tLOWER_NM`tSTATUS_CD`tSTATUS_NM`tPROCESS_SPEED`tTITLE`tREQUEST_COMPANY_CD`tREQUEST_COMPANY_NM`tREQUEST_DEPT_NM`tREQUEST_NM`tREGISTER_DATE`tAPP_MENU`tMANAGER_NM`tMANAGER_DEPT_NM`tRECEIPT_DATE`tBUSINESS_LEVEL`tCOMPLETE_RESERVE_DATE`tSOLUTION_FLAG`tWORK_TIME`tCOMPLETE_DATE`tPROCESS_CD`tPROCESS_NM`tVALUATION`tGUBUN_CD`tDELETE_FLAG`tCONTENT_TEXT`tCOMPLETE_TEXT`tCOMPLETE_CONTENT1"

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    OK $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    WARN $Message" -ForegroundColor Yellow }
function Write-Err { param([string]$Message) Write-Host "    ERROR $Message" -ForegroundColor Red }

function Format-Command {
    param([string]$Executable, [object[]]$Arguments)
    $parts = $Arguments | ForEach-Object {
        $value = [string]$_
        if ($value -match '\s') { '"' + $value + '"' } else { $value }
    }
    return "$Executable $($parts -join ' ')"
}

function Test-CurrentSourceKeyFormat {
    param([string]$JsonlPath)
    if (-not (Test-Path $JsonlPath)) { return $true }
    $firstLine = Get-Content -LiteralPath $JsonlPath -Encoding UTF8 -TotalCount 1
    if (-not $firstLine) { return $true }
    try {
        $record = $firstLine | ConvertFrom-Json
        return ([string]$record.source_key).StartsWith("tsvd999/")
    } catch {
        return $false
    }
}

function Get-TextLineCount {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    return @(Get-Content -LiteralPath $Path -Encoding UTF8).Count
}

function Get-ExpectedChunkInfos {
    $infos = @()
    $StartChunk..$EndChunk | ForEach-Object {
        $chunkNum = $_
        $start = (($chunkNum - 1) * $CHUNK_SIZE) + 1
        $end = [Math]::Min($chunkNum * $CHUNK_SIZE, $TOTAL_ROWS)
        $expectedRows = $end - $start + 1
        $fileName = "tsvd999_{0:d6}_{1:d6}.tsv" -f $start, $end
        $infos += [PSCustomObject]@{
            ChunkNum = $chunkNum
            Start = $start
            End = $end
            ExpectedRows = $expectedRows
            ExpectedLines = $expectedRows + 1
            Name = $fileName
            Path = (Join-Path $CHUNKS_DIR $fileName)
        }
    }
    return $infos
}

function Assert-ExpectedChunkCoverage {
    param([object[]]$ChunkInfos)
    foreach ($info in $ChunkInfos) {
        if (-not (Test-Path -LiteralPath $info.Path)) {
            Write-Err "Missing expected TSV chunk: $($info.Name)"
            exit 1
        }
        $lineCount = Get-TextLineCount $info.Path
        if ($lineCount -ne $info.ExpectedLines) {
            Write-Err "TSV chunk $($info.Name) has $lineCount lines; expected $($info.ExpectedLines)."
            exit 1
        }
        $header = Get-Content -LiteralPath $info.Path -Encoding UTF8 -TotalCount 1
        if ($header -ne $EXPECTED_TSV_HEADER) {
            Write-Err "TSV chunk $($info.Name) has an unexpected header."
            exit 1
        }
    }
}

function Get-NormalizedStats {
    param([string]$JsonlPath)
    $statsScript = @'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
rows = 0
missing = 0
keys = set()
if path.exists():
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.strip():
                continue
            rows += 1
            record = json.loads(line)
            key = record.get("source_key")
            if key:
                keys.add(key)
            else:
                missing += 1
print(json.dumps({"rows": rows, "distinct_source_key": len(keys), "missing_source_key": missing}))
'@
    return ($statsScript | py - $JsonlPath) | ConvertFrom-Json
}

if ($EndChunk -lt $StartChunk) {
    Write-Err "EndChunk must be greater than or equal to StartChunk."
    exit 1
}

if (-not $SkipExtract) {
    Write-Step "Phase 1: Compile ExportTsvd999Chunk.java"
    $classFile = Join-Path $SCRIPTS_DIR "ExportTsvd999Chunk.class"
    $javaFile = Join-Path $SCRIPTS_DIR "ExportTsvd999Chunk.java"

    if (-not (Test-Path $javaFile)) {
        Write-Err "Missing ExportTsvd999Chunk.java: $javaFile"
        exit 1
    }
    if (-not (Test-Path $OJDBC_JAR)) {
        Write-Err "Missing ojdbc8 JAR: $OJDBC_JAR"
        Write-Host "    Update OJDBC_JAR near the top of this script."
        exit 1
    }

    $needsCompile = -not (Test-Path $classFile)
    if (-not $needsCompile) {
        $needsCompile = (Get-Item $javaFile).LastWriteTimeUtc -gt (Get-Item $classFile).LastWriteTimeUtc
    }

    if ($needsCompile) {
        $compileArgs = @("-encoding", "UTF-8", "-cp", $OJDBC_JAR, $javaFile)
        if ($DryRun) {
            Write-Host "    [DRY] $(Format-Command 'javac' $compileArgs)"
            Write-Ok "Compile command prepared"
        } else {
            & javac @compileArgs
            if ($LASTEXITCODE -ne 0) { Write-Err "javac failed"; exit 1 }
            Write-Ok "Compile complete"
        }
    } else {
        Write-Ok "Already compiled: $classFile"
    }

    if (-not $env:ORACLE_USER) {
        Write-Err "ORACLE_USER is not set. Run: `$env:ORACLE_USER = '<schema_user>'"
        exit 1
    }
    if (-not $env:ORACLE_PASSWORD) {
        Write-Err "ORACLE_PASSWORD is not set."
        exit 1
    }
    if (-not $env:ORACLE_JDBC_URL) {
        Write-Err "ORACLE_JDBC_URL is not set. Use jdbc:oracle:thin:@<host>:<port>:<sid>."
        exit 1
    }

    Write-Step "Phase 2: Export Oracle TSV chunks ($StartChunk to $EndChunk)"
    New-Item -ItemType Directory -Force -Path $CHUNKS_DIR | Out-Null

    $successCount = 0
    $skipCount = 0

    Get-ExpectedChunkInfos | ForEach-Object {
        $info = $_
        $chunkNum = $info.ChunkNum
        $start = $info.Start
        $end = $info.End
        $expectedLines = $info.ExpectedLines
        $fileName = $info.Name
        $outFile = $info.Path
        $tmpFile = "$outFile.tmp"

        if (Test-Path $outFile) {
            $lineCount = Get-TextLineCount $outFile
            if ($lineCount -eq $expectedLines) {
                Write-Host "    skip [$chunkNum/$EndChunk] $fileName ($lineCount lines already)" -ForegroundColor DarkGray
                $script:skipCount += 1
                return
            }
            Write-Warn "Existing $fileName has $lineCount lines; expected $expectedLines. Re-exporting."
            if (-not $DryRun) {
                Remove-Item -LiteralPath $outFile -Force
            }
        }
        if ((Test-Path $tmpFile) -and -not $DryRun) {
            Remove-Item -LiteralPath $tmpFile -Force
        }

        $javaArgs = @("-cp", "$SCRIPTS_DIR;$OJDBC_JAR", "ExportTsvd999Chunk", "--start", $start, "--end", $end, "--output", $tmpFile)
        Write-Host "    [$chunkNum/$EndChunk] rows $start-$end -> $fileName"
        if ($DryRun) {
            Write-Host "    [DRY] $(Format-Command 'java' $javaArgs)"
        } else {
            & java @javaArgs
            if ($LASTEXITCODE -ne 0) {
                Write-Err "Chunk $chunkNum failed with exit $LASTEXITCODE."
                exit 1
            }
            $tmpLineCount = Get-TextLineCount $tmpFile
            if ($tmpLineCount -ne $expectedLines) {
                Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
                Write-Err "Chunk $chunkNum wrote $tmpLineCount lines; expected $expectedLines."
                exit 1
            }
            Move-Item -LiteralPath $tmpFile -Destination $outFile -Force
            $script:successCount += 1
        }
    }

    Write-Ok "Export finished: $successCount success, $skipCount skipped"
}

if (-not $SkipNormalize) {
    Write-Step "Phase 3: Heuristic normalization with --resume"
    if (-not (Test-CurrentSourceKeyFormat $NORMALIZED_JSONL)) {
        $message = "Existing normalized_cases.jsonl uses the legacy source_key format. Move or delete data\cases\normalized_cases*.jsonl and data\cases\clusters.json before rerunning."
        if ($DryRun) {
            Write-Warn $message
        } else {
            Write-Err $message
            exit 1
        }
    }
    $expectedChunkInfos = @(Get-ExpectedChunkInfos)
    if ($SkipExtract) {
        Assert-ExpectedChunkCoverage $expectedChunkInfos
    }
    $tsvFiles = @($expectedChunkInfos | ForEach-Object { Get-Item -LiteralPath $_.Path } | Sort-Object Name)
    if ($tsvFiles.Count -eq 0) {
        Write-Warn "No TSV files found. Run without -SkipExtract first."
    } else {
        Write-Host "    TSV files: $($tsvFiles.Count)"
        $failedNormalizations = @()
        $expectedNormalizedRows = 0
        $i = 0
        foreach ($tsv in $tsvFiles) {
            $i += 1
            $lineCount = Get-TextLineCount $tsv.FullName
            if ($lineCount -lt 2) {
                Write-Err "TSV file has no data rows: $($tsv.Name)"
                exit 1
            }
            $expectedNormalizedRows += ($lineCount - 1)
            Write-Host "    [$i/$($tsvFiles.Count)] $($tsv.Name)"
            $normalizeArgs = @("$SCRIPTS_DIR\normalize-tsvd999.py", "--input", $tsv.FullName, "--output", $NORMALIZED_JSONL, "--mode", "heuristic", "--resume")
            if ($DryRun) {
                Write-Host "    [DRY] $(Format-Command 'py' $normalizeArgs)"
            } else {
                & py @normalizeArgs
                if ($LASTEXITCODE -ne 0) {
                    Write-Err "Normalization failed for $($tsv.Name)."
                    $failedNormalizations += $tsv.Name
                }
            }
        }
        if ($failedNormalizations.Count -gt 0) {
            Write-Err "Normalization failed for $($failedNormalizations.Count) chunks. Stop before clustering."
            exit 1
        }
        $stats = Get-NormalizedStats $NORMALIZED_JSONL
        if ([int]$stats.rows -ne $expectedNormalizedRows -or [int]$stats.distinct_source_key -ne $expectedNormalizedRows -or [int]$stats.missing_source_key -ne 0) {
            Write-Err "Normalized JSONL gate failed: rows=$($stats.rows), distinct_source_key=$($stats.distinct_source_key), missing_source_key=$($stats.missing_source_key), expected=$expectedNormalizedRows."
            exit 1
        }
        Write-Ok "Normalization finished: $($stats.rows) lines"
    }
}

if (-not $SkipCluster) {
    Write-Step "Phase 4: Fallback clustering"
    if (-not (Test-Path $NORMALIZED_JSONL)) {
        Write-Err "Missing normalized result: $NORMALIZED_JSONL"
        exit 1
    }

    $clusterArgs = @("$SCRIPTS_DIR\cluster-cases.py", "--input", $NORMALIZED_JSONL, "--output", $CLUSTERS_JSON, "--cases-output", $CLUSTERED_JSONL, "--method", "fallback")
    if ($DryRun) {
        Write-Host "    [DRY] $(Format-Command 'py' $clusterArgs)"
    } else {
        & py @clusterArgs
        if ($LASTEXITCODE -ne 0) { Write-Err "Clustering failed"; exit 1 }
    }

    if (Test-Path $CLUSTERS_JSON) {
        Write-Ok "Clustering finished: $CLUSTERS_JSON"
    }
}

Write-Step "Done"
Write-Host @"
Next:
  docker exec jarvis-postgres psql -U jarvis -d jarvis -c "SELECT id, name FROM workspace LIMIT 5;"

  pnpm exec tsx scripts/import-cases-to-jarvis.ts ``
    --workspace-id <uuid> ``
    --cases data/cases/normalized_cases.clustered.jsonl ``
    --clusters data/cases/clusters.json ``
    --create-digests

Outputs:
  data/cases/chunks/
  data/cases/normalized_cases.jsonl
  data/cases/clusters.json
  data/cases/normalized_cases.clustered.jsonl
"@
