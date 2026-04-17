#!/usr/bin/env python3
"""Parse TSMT001.sql (Oracle `Insert into EXPORT_TABLE ... values (...)` dump)
into one JSON object per row.

Input  : data/tsvd999-style SQL export with CRYPTIT.DECRYPT() columns
Output : data/infra/records.jsonl (one JSON per line, 392 rows expected)

Oracle dialect handled:
- Multi-line string literals (newlines inside '...' are literal)
- Escaped single quote via '' inside string literal
- `null` keyword (unquoted) → JSON null
- Raw numeric literal (unquoted) → JSON number or preserved as string if >2^53
- Column list prefix `CASEWHENDEV_GB_CD='1'THEN'개발'ELSE'운영'END` mapped to env_type
- Column list prefix `CRYPTIT.DECRYPT(COL,'SSMS')` mapped to COL (lowercased)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


# Fixed column → field mapping (TSMT001 export schema).
# The SQL column list uses Oracle DECRYPT() wrappers and CASE WHEN expressions
# that we normalize to these stable field names.
COLUMN_MAP = {
    "ENTER_CD": "enter_cd",
    "COMPANY_CD": "company_cd",
    "CASEWHENDEV_GB_CD": "env_type",  # CASE WHEN DEV_GB_CD='1' THEN '개발' ELSE '운영'
    "CONNECT_CD": "connect_cd",
    "VPN_FILE_SEQ": "vpn_file_seq",
    "DOMAIN_ADDR": "domain_addr",
    "LOGIN_INFO": "login_info",
    "SVN_ADDR": "svn_addr",
    "DB_CONNECT_INFO": "db_connect_info",
    "DB_USER_INFO": "db_user_info",
    "SRC_INFO": "src_info",
    "CLASS_INFO": "class_info",
    "MEMO": "memo",
}


def extract_column_names(column_list_text: str) -> list[str]:
    """Given the `(col1, col2, ...)` text between `EXPORT_TABLE` and `values`,
    return a list of normalized SQL column identifiers."""
    # Strip leading/trailing whitespace + wrapping parens.
    stripped = column_list_text.strip()
    if stripped.startswith("("):
        stripped = stripped[1:]
    if stripped.endswith(")"):
        stripped = stripped[:-1]

    # Walk tokens respecting quotes: Oracle quotes each DECRYPT() call with "..."
    cols: list[str] = []
    buf: list[str] = []
    depth_paren = 0
    in_dquote = False
    in_squote = False
    i = 0
    while i < len(stripped):
        ch = stripped[i]
        if in_dquote:
            buf.append(ch)
            if ch == '"':
                in_dquote = False
        elif in_squote:
            buf.append(ch)
            if ch == "'":
                in_squote = False
        else:
            if ch == '"':
                in_dquote = True
                buf.append(ch)
            elif ch == "'":
                in_squote = True
                buf.append(ch)
            elif ch == "(":
                depth_paren += 1
                buf.append(ch)
            elif ch == ")":
                depth_paren -= 1
                buf.append(ch)
            elif ch == "," and depth_paren == 0:
                cols.append("".join(buf).strip())
                buf = []
            else:
                buf.append(ch)
        i += 1
    if buf:
        cols.append("".join(buf).strip())

    # Normalize each: strip "..." wrapper + CRYPTIT.DECRYPT() wrapper + CASE expr.
    out: list[str] = []
    for raw in cols:
        inner = raw
        if inner.startswith('"') and inner.endswith('"'):
            inner = inner[1:-1]
        m = re.match(r"CRYPTIT\.DECRYPT\(([A-Z_]+)\s*,", inner)
        if m:
            out.append(m.group(1))
            continue
        if inner.startswith("CASEWHENDEV_GB_CD") or inner.startswith("CASE WHEN DEV_GB_CD"):
            out.append("CASEWHENDEV_GB_CD")
            continue
        out.append(inner.strip())
    return out


def parse_values(values_text: str) -> list[Any]:
    """Parse Oracle `values (...)` body into a list of Python primitives.

    Rules:
    - 'literal' → string, with '' → ' and newline preserved as-is.
    - null     → None.
    - bare numeric token → int (if fits) or str.
    """
    # Strip outermost parens.
    stripped = values_text.strip()
    if stripped.startswith("("):
        stripped = stripped[1:]
    if stripped.endswith(")"):
        stripped = stripped[:-1]

    tokens: list[Any] = []
    i = 0
    n = len(stripped)
    while i < n:
        # Skip whitespace/commas between tokens.
        while i < n and stripped[i] in " \t\n\r":
            i += 1
        if i >= n:
            break
        if stripped[i] == ",":
            i += 1
            continue

        ch = stripped[i]
        if ch == "'":
            # String literal: read until unescaped closing quote.
            i += 1
            buf: list[str] = []
            while i < n:
                c = stripped[i]
                if c == "'":
                    # Check for escaped ''
                    if i + 1 < n and stripped[i + 1] == "'":
                        buf.append("'")
                        i += 2
                        continue
                    # End of string.
                    i += 1
                    break
                buf.append(c)
                i += 1
            tokens.append("".join(buf))
        else:
            # Unquoted token: null or numeric, read until next comma at depth 0.
            j = i
            depth = 0
            while j < n:
                cj = stripped[j]
                if cj == "(":
                    depth += 1
                elif cj == ")":
                    depth -= 1
                elif cj == "," and depth == 0:
                    break
                j += 1
            raw = stripped[i:j].strip()
            i = j
            if raw.lower() == "null" or raw == "":
                tokens.append(None)
            else:
                # Try int first, fall back to preserving as string.
                try:
                    tokens.append(int(raw))
                except ValueError:
                    tokens.append(raw)
    return tokens


def iter_inserts(text: str):
    """Yield (source_line_1_based, column_list_text, values_text) for each
    `Insert into EXPORT_TABLE (...) values (...);` statement.

    Uses a stateful scanner to respect single quotes (which may contain `;`,
    newlines, or `)`).
    """
    # Precompute line offsets so we can report the 1-based line where each
    # INSERT starts (useful for citing back to TSMT001#rowN).
    line_starts = [0]
    for m in re.finditer(r"\n", text):
        line_starts.append(m.end())

    def offset_to_line(offset: int) -> int:
        import bisect
        return bisect.bisect_right(line_starts, offset)

    pattern = re.compile(r"Insert into EXPORT_TABLE\s*", re.IGNORECASE)
    pos = 0
    while True:
        m = pattern.search(text, pos)
        if not m:
            return
        start = m.start()
        i = m.end()

        # Parse column list: starts with '(' and ends at matching ')'
        # Skip whitespace.
        while i < len(text) and text[i] in " \t\r\n":
            i += 1
        if i >= len(text) or text[i] != "(":
            pos = m.end()
            continue
        col_start = i
        depth = 0
        in_squote = False
        in_dquote = False
        while i < len(text):
            c = text[i]
            if in_squote:
                if c == "'":
                    if i + 1 < len(text) and text[i + 1] == "'":
                        i += 2
                        continue
                    in_squote = False
            elif in_dquote:
                if c == '"':
                    in_dquote = False
            else:
                if c == "'":
                    in_squote = True
                elif c == '"':
                    in_dquote = True
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
            i += 1
        column_list_text = text[col_start:i]

        # Skip whitespace, then expect literal `values`.
        while i < len(text) and text[i] in " \t\r\n":
            i += 1
        if not text[i : i + 6].lower() == "values":
            pos = m.end()
            continue
        i += 6
        while i < len(text) and text[i] in " \t\r\n":
            i += 1
        if i >= len(text) or text[i] != "(":
            pos = m.end()
            continue

        val_start = i
        depth = 0
        in_squote = False
        while i < len(text):
            c = text[i]
            if in_squote:
                if c == "'":
                    if i + 1 < len(text) and text[i + 1] == "'":
                        i += 2
                        continue
                    in_squote = False
            else:
                if c == "'":
                    in_squote = True
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
            i += 1
        values_text = text[val_start:i]

        # Skip trailing semicolon if present.
        while i < len(text) and text[i] in " \t\r\n":
            i += 1
        if i < len(text) and text[i] == ";":
            i += 1

        yield (offset_to_line(start), column_list_text, values_text)
        pos = i


def parse_file(input_path: Path) -> list[dict]:
    text = input_path.read_text(encoding="utf-8", errors="replace")
    records: list[dict] = []
    canonical_cols: list[str] | None = None

    for row_idx, (src_line, col_list_text, values_text) in enumerate(
        iter_inserts(text), start=1
    ):
        cols = extract_column_names(col_list_text)
        if canonical_cols is None:
            canonical_cols = cols
            expected = set(COLUMN_MAP.keys())
            got = set(cols)
            missing = expected - got
            extra = got - expected
            if missing or extra:
                sys.stderr.write(
                    f"[WARN] column drift at row {row_idx}: "
                    f"missing={sorted(missing)} extra={sorted(extra)}\n"
                )
        elif cols != canonical_cols:
            sys.stderr.write(
                f"[WARN] column reordering at row {row_idx} (line {src_line})\n"
            )

        values = parse_values(values_text)
        if len(values) != len(cols):
            sys.stderr.write(
                f"[WARN] row {row_idx} line {src_line}: "
                f"values={len(values)} vs cols={len(cols)}\n"
            )

        record: dict[str, Any] = {
            "row_number": row_idx,
            "source_line": src_line,
        }
        for col, val in zip(cols, values):
            field = COLUMN_MAP.get(col)
            if field is None:
                # Unmapped column — preserve under lower-case col name.
                field = col.lower()
            record[field] = val
        records.append(record)

    return records


def main() -> int:
    ap = argparse.ArgumentParser(description="Parse TSMT001.sql into JSONL.")
    ap.add_argument("--input", type=Path, default=Path("TSMT001.sql"))
    ap.add_argument("--output", type=Path, default=Path("data/infra/records.jsonl"))
    ap.add_argument("--pretty", action="store_true", help="indent output for debugging")
    args = ap.parse_args()

    if not args.input.exists():
        sys.stderr.write(f"[ERROR] input not found: {args.input}\n")
        return 1

    records = parse_file(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as fh:
        for r in records:
            if args.pretty:
                fh.write(json.dumps(r, ensure_ascii=False, indent=2))
                fh.write("\n---\n")
            else:
                fh.write(json.dumps(r, ensure_ascii=False))
                fh.write("\n")

    sys.stderr.write(f"[OK] parsed {len(records)} rows → {args.output}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
