"""Tests for scripts/parse-tsmt001.py.

Focus areas:
- Oracle `''` escape inside string literals
- Multi-line values (MEMO with newlines, DB_CONNECT_INFO with prev-IP note)
- `null` literals
- 13-column schema mapping
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "parse-tsmt001.py"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "tsmt001_sample.sql"


def run_parser(tmp_path):
    out = tmp_path / "records.jsonl"
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--input", str(FIXTURE), "--output", str(out)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"parser failed: {result.stderr}"
    return [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines() if line]


def test_parses_all_three_rows(tmp_path):
    records = run_parser(tmp_path)
    assert len(records) == 3


def test_row1_simple_mapping(tmp_path):
    records = run_parser(tmp_path)
    r = records[0]
    assert r["enter_cd"] == "SSMS"
    assert r["company_cd"] == "ACME"
    assert r["env_type"] == "운영"
    assert r["connect_cd"] == "IP"
    assert r["vpn_file_seq"] is None
    assert r["domain_addr"] == "http://acme.example.com/"
    assert r["login_info"] == "user1 / pass1"
    assert r["svn_addr"] == "ACME_HR"
    assert r["db_connect_info"] == "192.168.1.1:1521:PROD"
    assert r["db_user_info"] == "DBUSER / DBPW"
    assert r["src_info"] == "ACME_SRC"
    assert r["class_info"] == "ACME_CLASS"
    assert r["memo"] == "간단한 메모"


def test_row2_oracle_escaped_quote(tmp_path):
    records = run_parser(tmp_path)
    r = records[1]
    # '' inside string should become single '
    assert r["login_info"] == "admin / 'quoted'pw"


def test_row2_multiline_db_connect(tmp_path):
    records = run_parser(tmp_path)
    r = records[1]
    # DB_CONNECT_INFO spans two lines (current + previous-IP note)
    assert "10.0.0.5:1521:DEV" in r["db_connect_info"]
    assert "(이전 10.0.0.4)" in r["db_connect_info"]
    assert r["db_connect_info"].count("\n") == 1


def test_row2_multiline_memo(tmp_path):
    records = run_parser(tmp_path)
    r = records[1]
    assert r["memo"].splitlines() == ["다중라인", "메모 두번째 줄", "세번째 줄"]


def test_row2_vpn_file_seq_numeric(tmp_path):
    records = run_parser(tmp_path)
    r = records[1]
    # VPN_FILE_SEQ is a raw numeric literal (no quotes), parser should keep as string or int
    assert str(r["vpn_file_seq"]) == "2020010101"


def test_row3_all_nulls(tmp_path):
    records = run_parser(tmp_path)
    r = records[2]
    # only ENTER_CD + COMPANY_CD are set; all other columns null
    assert r["enter_cd"] == "SSMS"
    assert r["company_cd"] == "NULLS"
    for col in ("env_type", "connect_cd", "vpn_file_seq", "domain_addr",
                "login_info", "svn_addr", "db_connect_info", "db_user_info",
                "src_info", "class_info", "memo"):
        assert r[col] is None, f"expected {col}=None, got {r[col]!r}"


def test_row_numbers_preserved(tmp_path):
    records = run_parser(tmp_path)
    for i, r in enumerate(records, 1):
        assert r["row_number"] == i, f"row_number mismatch at index {i}"


def test_record_has_source_line(tmp_path):
    """Each record should record the source SQL line where the INSERT started,
    so sanitizer/LLM review can cite TSMT001#rowN → exact line."""
    records = run_parser(tmp_path)
    assert all("source_line" in r for r in records)
    assert all(isinstance(r["source_line"], int) and r["source_line"] > 0 for r in records)
