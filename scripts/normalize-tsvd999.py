#!/usr/bin/env python3
"""Normalize Oracle TSVD999 service-desk rows into Jarvis case JSONL.

Input is a UTF-8 TSV exported from the legacy TSVD999 table. Output is JSONL where
each line can be imported into the Jarvis precedent_case table.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import html
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_CONCURRENCY = 50
KST = ZoneInfo("Asia/Seoul")

SYSTEM_PROMPT = """당신은 IT 서비스데스크 사례를 정규화하는 전문가입니다.
주어진 유지보수 요청(CONTENT)과 답변(COMPLETE_CONTENT)을 분석하여 다음 구조로 추출하세요.

규칙:
- 개인정보(이름, 사번, 이메일)는 제거
- 회사명은 유지 (고객사 컨텍스트로 활용)
- HTML 태그 제거
- 핵심 기술 용어는 보존
- 내용이 비어있거나 의미없는 경우 해당 필드를 null로 둔다
- JSON schema에 맞는 값만 반환한다
"""

CASE_SCHEMA: dict[str, Any] = {
    "name": "tsvd999_case_normalization",
    "schema": {
        "type": "object",
        "properties": {
            "symptom": {"type": ["string", "null"]},
            "cause": {"type": ["string", "null"]},
            "action": {"type": ["string", "null"]},
            "result": {
                "type": "string",
                "enum": ["resolved", "workaround", "escalated", "no_fix", "info_only"],
            },
            "severity": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 0,
                "maxItems": 5,
            },
        },
        "required": ["symptom", "cause", "action", "result", "severity", "tags"],
        "additionalProperties": False,
    },
    "strict": True,
}

NON_PERSON_NAME_TERMS = {
    "가능",
    "계산",
    "고객",
    "관리",
    "근무",
    "급여",
    "경영",
    "기능",
    "내용",
    "대상",
    "데이터",
    "등록",
    "메뉴",
    "문서",
    "반영",
    "발생",
    "변경",
    "사용",
    "삭제",
    "생성",
    "설정",
    "소득세",
    "수정",
    "시스템",
    "신청",
    "안내",
    "연차",
    "오류",
    "완료",
    "요청",
    "자료",
    "주민세",
    "저장",
    "전달",
    "지방소득",
    "지방소득세",
    "조회",
    "처리",
    "출력",
    "취소",
    "취득세",
    "확인",
    "휴일",
    "화면",
}

NAME_SUFFIXES = ("에게는", "께서는", "께서", "에게", "으로", "의", "은", "는", "이", "가", "을", "를", "등")
TAX_TERMS = ("지방소득세", "소득세", "주민세", "취득세", "등록세", "원천세", "법인세", "재산세", "부가가치세", "부가세")


def strip_name_suffix(token: str) -> tuple[str, str]:
    for suffix in NAME_SUFFIXES:
        if token.endswith(suffix) and len(token) > len(suffix):
            return token[: -len(suffix)], suffix
    return token, ""


def is_probable_person_name(token: str) -> bool:
    return bool(re.fullmatch(r"[가-힣]{2,4}", token)) and token not in NON_PERSON_NAME_TERMS


def mask_name_employee_id(match: re.Match[str]) -> str:
    name = match.group(1)
    if not is_probable_person_name(name):
        return match.group(0)
    return "[이름] [사번]"


def mask_comma_name_list(match: re.Match[str]) -> str:
    parts = re.split(r"\s*,\s*", match.group(0))
    masked: list[str] = []
    changed = False
    for part in parts:
        base, suffix = strip_name_suffix(part)
        if is_probable_person_name(base):
            changed = True
            masked.append("[이름]" + (" 등" if suffix == "등" else ""))
        else:
            masked.append(part)
    return ", ".join(masked) if changed else match.group(0)


def mask_name_capture(match: re.Match[str]) -> str:
    name = match.group("name")
    if not is_probable_person_name(name):
        return match.group(0)
    return match.group(0).replace(name, "[이름]", 1)


def mask_dash_name_pair(match: re.Match[str]) -> str:
    left = match.group("left")
    right = match.group("right")
    if is_probable_person_name(left) and is_probable_person_name(right):
        return "[이름] - [이름]"
    return match.group(0)


def mask_name_department_role(match: re.Match[str]) -> str:
    name = match.group("name")
    if not is_probable_person_name(name):
        return match.group(0)
    return "[이름] [부서] [직급]"


def mask_parenthesized_name(match: re.Match[str]) -> str:
    name = match.group("name")
    if not is_probable_person_name(name):
        return match.group(0)
    return "([이름])"


def sanitize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = html.unescape(str(value))
    protected_terms: dict[str, str] = {}
    for index, term in enumerate(TAX_TERMS):
        marker = f"__JARVIS_TAX_TERM_{index}__"
        if term in text:
            text = text.replace(term, marker)
            protected_terms[marker] = term
    text = text.replace("\ufffd", " ")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email]", text)
    text = re.sub(r"\b[가-힣]{2,4}\s*\(\s*\d{5,10}\s*\)", "[이름]([사번])", text)
    text = re.sub(
        r"\b(대상자|요청자|담당자|성명|이름)\s*[:：]?\s*[가-힣]{2,4}",
        r"\1 [이름]",
        text,
    )
    text = re.sub(r"\([가-힣]{2,4}(?:\s*,\s*[가-힣]{2,4})+\)", "([이름])", text)
    for _ in range(5):
        next_text = re.sub(r"\b\d{4,10}\s*/\s*[가-힣]{2,4}(?=\d|[^\w]|$)", "[사번] / [이름]", text)
        next_text = re.sub(
            r"\b\d{4,10}\s*/\s*[가-힣]{2,4}(?=활동|근태|결재|업적|근로소득|전기|내부|경영|조직|평가|휴일|유연)",
            "[사번] / [이름]",
            next_text,
        )
        next_text = re.sub(r"\b([가-힣]{2,4})[\s_-]*\d{5,10}(?=\s|[가-힣]|[^\w]|$)", mask_name_employee_id, next_text)
        if next_text == text:
            break
        text = next_text
    text = re.sub(r"\b[가-힣]{2,4}\s*\(\s*\[전화번호\]\s*\)", "[이름]([전화번호])", text)
    text = re.sub(r"\b[가-힣]{2,4}\s*\(\s*\[사번\]\s*\)", "[이름]([사번])", text)
    text = re.sub(r"\[전화번호\]\s+[가-힣]{2,4}", "[전화번호] [이름]", text)
    text = re.sub(r"\b\d{5,10}\s+[가-힣]{2,4}(?=\s|[^\w]|$)", "[사번] [이름]", text)
    text = re.sub(r"\b[A-Z]{1,3}\d{4,}\s*[가-힣]{2,4}(?=[가-힣]|\s|[^\w]|$)", "[사번] [이름]", text)
    text = re.sub(r"\b[A-Z]\d{4,}\s*[가-힣]{2,4}\b", "[사번] [이름]", text)
    text = re.sub(r"\b[A-Z]\d{4,}\b", "[사번]", text)
    text = re.sub(r"\b[가-힣]{2,4}(?=\s*사번)", "[이름]", text)
    text = re.sub(r"(?i)(사번|employee\s*id)\s*[:：]?\s*[A-Z]?\d{4,10}", r"\1 [사번]", text)
    text = re.sub(r"\b\d{3,10}\s+(?P<name>[가-힣]{2,4})(?=업적|근로소득|활동|근태|결재|전기|내부|경영|조직|평가|휴일|유연)", mask_name_capture, text)
    text = re.sub(
        r"(?P<name>[가-힣]{2,4})\s+[A-Za-z0-9가-힣]{2,30}(?:팀|파트|실|센터)\s*(?:사원|주임|대리|책임|선임|과장|차장|부장|팀장|상무|전무|사장|대표|센터장)",
        mask_name_department_role,
        text,
    )
    text = re.sub(
        r"\b[가-힣]{2,4}\s*(?:사원|주임|대리|책임|선임|과장|차장|부장|팀장|상무|전무|사장|대표|센터장)(?:님|입니다)?(?:께서|께|이|가|은|는|을|를|에게)?",
        "[이름] [직급]",
        text,
    )
    text = re.sub(
        r"\b[가-힣]{2,4}\s*(?:사원님|주임님|대리님|책임님|선임님|과장님|차장님|부장님|팀장님|상무님|전무님|사장님|대표님|센터장님)(?:께서|께|이|가|은|는|을|를|에게)?",
        "[이름] [직급]",
        text,
    )
    text = re.sub(r"\b[가-힣]{2,4}\s+\[이름\](?=입니다|[^\w]|$)", "[이름] [이름]", text)
    text = re.sub(r"\((?P<name>[가-힣]{2,4})\)", mask_parenthesized_name, text)
    text = re.sub(r"(?P<left>[가-힣]{2,4})\s*-\s*(?P<right>[가-힣]{2,4})", mask_dash_name_pair, text)
    text = re.sub(r"(?<![가-힣])(?P<name>[가-힣]{2,4})\s*(?=활동|근태|결재|업적|근로소득|전기|내부|경영|조직|평가|휴일|유연)", mask_name_capture, text)
    text = re.sub(r"\b[가-힣]{2,4}(?:\s*,\s*[가-힣]{2,4})+(?:은|는|이|가|을|를|등)?(?!세)", mask_comma_name_list, text)
    text = re.sub(
        r"(?<![가-힣])(?!담당자|관리자|사용자|고객|책임|대리|선임|주임|팀장|과장|차장|부장|상무|전무|사장|대표|센터장)([가-힣]{2,4})\s*님(?:의|께서|께|은|는|이|가|을|를|에게)?",
        "[이름]님",
        text,
    )
    text = re.sub(r"\b[가-힣]{2,4}\s*드림\b", "[이름] 드림", text)
    text = re.sub(r"\b[가-힣]{2,4}\s*(?=입니다\b)", "[이름]", text)
    text = re.sub(r"\b[가-힣]{2,4}\s*등\b", "[이름] 등", text)
    text = re.sub(r"\b\d{6}-\d{7}\b", "[주민번호]", text)
    text = re.sub(r"(?<![\d-])01[016789]-?\d{3,4}-?\d{4}(?![\d-])", "[전화번호]", text)
    text = re.sub(r"\b[가-힣]{2,4}\s*\(\s*\[전화번호\]\s*\)", "[이름]([전화번호])", text)
    for marker, term in protected_terms.items():
        text = text.replace(marker, term)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def truncate(value: Any, limit: int) -> str | None:
    cleaned = sanitize_text(value)
    if cleaned is None:
        return None
    return cleaned[:limit]


def parse_int(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(float(str(value).replace(",", "").strip()))
    except ValueError:
        return None


def parse_float(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def parse_oracle_datetime(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y%m%d%H%M%S",
        "%Y%m%d",
    ]
    for fmt in formats:
        try:
            parsed = datetime.strptime(raw[: len(datetime.now().strftime(fmt))], fmt)
            return parsed.replace(tzinfo=KST).isoformat()
        except ValueError:
            continue
    return None


def build_source_key(row: dict[str, Any]) -> str:
    oracle_rowid = string_key_part(row.get("ORACLE_ROWID"), 200)
    if oracle_rowid:
        return f"tsvd999/rowid/{oracle_rowid}"

    rn = parse_int(row.get("RN"))
    if rn is not None:
        return f"tsvd999/rn/{rn}"

    enter_cd = truncate(row.get("ENTER_CD"), 50) or "UNKNOWN_ENTER"
    yyyy = truncate(row.get("YYYY"), 4) or "0000"
    mm = truncate(row.get("MM"), 2) or "00"
    seq = parse_int(row.get("SEQ"))
    seq_part = str(seq) if seq is not None else "NO_SEQ"
    return f"{enter_cd}/{yyyy}/{mm}/{seq_part}"


def string_key_part(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    return re.sub(r"[^A-Za-z0-9_./:+-]+", "_", raw[:limit])


def validate_openai_api_key(value: str | None) -> str | None:
    if value is None:
        return None
    key = value.strip()
    # Only reject obvious placeholders
    if not key or key in {"sk-...", "sk-placeholder", "sk-local-placeholder"}:
        return None
    return key


def load_env_file() -> None:
    """Load .env file from project root into os.environ (simple parser, no dependency)."""
    for candidate in [
        Path(__file__).resolve().parent.parent / ".env",
        Path.cwd() / ".env",
    ]:
        if candidate.exists():
            with candidate.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
            break


def extract_empty_case(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "symptom": None,
        "cause": None,
        "action": None,
        "result": "info_only",
        "severity": "low",
        "tags": [],
    }


# ---------------------------------------------------------------------------
# Heuristic (규칙 기반) 정규화 — API 호출 없이 텍스트 패턴으로 추출
# ---------------------------------------------------------------------------
def _first_n_sentences(text: str | None, n: int = 3) -> str | None:
    """텍스트에서 처음 n문장만 추출 (요약 대용)."""
    if not text:
        return None
    # 마침표·느낌표·물음표·개행 기준 split
    sentences = re.split(r'(?<=[.!?。])\s+|\n+', text.strip())
    result = ' '.join(s.strip() for s in sentences[:n] if s.strip())
    return result[:500] if result else None


def _infer_severity(row: dict[str, Any]) -> str:
    """BUSINESS_LEVEL + PROCESS_SPEED 기반 severity 추정."""
    level = str(row.get("BUSINESS_LEVEL", "")).upper().strip()
    urgent = str(row.get("PROCESS_SPEED", "")).upper() == "Y"
    if level in ("D", "C") or urgent:
        return "high"
    if level == "B":
        return "medium"
    return "low"


def _infer_result(row: dict[str, Any]) -> str:
    """SOLUTION_FLAG + STATUS_CD + PROCESS_NM 기반 result 추정."""
    solved = str(row.get("SOLUTION_FLAG", "")).upper() == "Y"
    status = str(row.get("STATUS_CD", ""))
    process_nm = str(row.get("PROCESS_NM", "")).lower()

    if solved or status == "4":  # 처리완료
        # 안내/확인 계열
        if any(kw in process_nm for kw in ("안내", "확인", "문의", "상담", "질의")):
            return "info_only"
        # 수정/패치/개선 계열
        if any(kw in process_nm for kw in ("오류 수정", "개선", "패치", "수정", "변경", "반영", "적용")):
            return "resolved"
        # 데이터 조작 계열
        if any(kw in process_nm for kw in ("데이터", "수기", "보정", "초기화")):
            return "workaround"
        # 권한/설정 계열
        if any(kw in process_nm for kw in ("권한", "설정", "등록", "해제", "추가", "삭제")):
            return "resolved"
        return "resolved" if solved else "info_only"
    if status == "3":  # 미평가
        return "resolved" if solved else "no_fix"
    if status in ("1", "2"):  # 접수/처리중
        return "no_fix"
    return "info_only"


def _extract_tags(row: dict[str, Any]) -> list[str]:
    """카테고리·메뉴·처리구분에서 태그 추출."""
    tags: list[str] = []
    higher = sanitize_text(row.get("HIGHER_NM"))
    lower = sanitize_text(row.get("LOWER_NM"))
    process_nm = sanitize_text(row.get("PROCESS_NM"))
    app_menu = sanitize_text(row.get("APP_MENU"))

    if higher:
        tags.append(higher)
    if lower:
        tags.append(lower)
    if process_nm and process_nm not in tags:
        tags.append(process_nm)
    # app_menu에서 마지막 경로 요소 추출 (예: "급여관리>월급여관리>급/상여계산" → "급/상여계산")
    if app_menu and ">" in app_menu:
        last_segment = app_menu.split(">")[-1].strip()
        if last_segment and last_segment not in tags:
            tags.append(last_segment)

    return tags[:5]


def _extract_cause(text: str) -> str | None:
    """답변/조치 텍스트에서 원인 설명 부분을 추출."""
    if not text:
        return None
    lower = text.lower()

    # 1차: 명시적 마커 이후 문장 추출
    explicit_markers = [
        "원인:", "원인 :", "원인은", "원인분석", "원인 분석",
        "확인결과", "확인 결과", "확인해보니", "확인해 보니",
        "이유:", "이유 :", "사유:", "사유 :",
        "문제원인", "문제 원인", "장애원인", "장애 원인",
    ]
    for marker in explicit_markers:
        idx = lower.find(marker)
        if idx != -1:
            cause_text = text[idx:]
            return _first_n_sentences(cause_text, 2)

    # 2차: 인과 패턴 포함 문장 추출
    causal_patterns = re.compile(
        r'(?:로\s*인해|로\s*인한|때문에|때문입니다|에\s*의해|에\s*의한'
        r'|원인이|인하여|발생하여|발생한\s*것|현상이\s*발생'
        r'|설정이\s*(?:되어|안\s*되어|잘못)'
        r'|(?:데이터|값|코드|설정|권한)(?:가|이)\s*(?:누락|잘못|없어|오류))',
        re.IGNORECASE,
    )
    # 문장 단위로 나눠서 매칭
    sentences = re.split(r'(?<=[.!?。])\s+|\s{2,}', text)
    for sentence in sentences:
        if causal_patterns.search(sentence):
            clean = sentence.strip()[:300]
            if len(clean) > 10:
                return clean

    return None


def _extract_symptom(content: str, title: str | None = None) -> str | None:
    """CONTENT_TEXT에서 증상/문의 내용을 추출. 문장 구분자 없어도 동작."""
    if not content:
        # title이라도 있으면 사용
        return title[:500] if title else None

    # 문장 구분자가 있으면 처음 3문장
    result = _first_n_sentences(content, 3)
    if result and len(result) > 20:
        return result

    # 문장 구분자 없으면 처음 500자 직접 절삭
    stripped = content.strip()
    if len(stripped) > 500:
        # 단어 경계에서 끊기
        cut = stripped[:500]
        last_space = cut.rfind(" ")
        if last_space > 300:
            cut = cut[:last_space]
        return cut
    return stripped if stripped else None


def extract_heuristic(row: dict[str, Any]) -> dict[str, Any]:
    """API 없이 규칙 기반으로 symptom/cause/action/result/severity/tags 추출."""
    content = sanitize_text(row.get("CONTENT_TEXT")) or ""
    complete = (
        sanitize_text(row.get("COMPLETE_TEXT"))
        or sanitize_text(row.get("COMPLETE_CONTENT1"))
        or ""
    )
    title = sanitize_text(row.get("TITLE")) or ""

    symptom = _extract_symptom(content, title)
    cause = _extract_cause(complete)
    action = _first_n_sentences(complete, 3)

    # action이 없으면 COMPLETE_CONTENT1 fallback
    if not action and row.get("COMPLETE_CONTENT1"):
        action = _first_n_sentences(
            sanitize_text(row.get("COMPLETE_CONTENT1")) or "", 3
        )

    result = _infer_result(row)
    severity = _infer_severity(row)
    tags = _extract_tags(row)

    return {
        "symptom": symptom,
        "cause": cause,
        "action": action,
        "result": result,
        "severity": severity,
        "tags": tags,
    }


def normalize_extracted(value: dict[str, Any]) -> dict[str, Any]:
    result = value.get("result") if value.get("result") in {
        "resolved",
        "workaround",
        "escalated",
        "no_fix",
        "info_only",
    } else "info_only"
    severity = value.get("severity") if value.get("severity") in {
        "low",
        "medium",
        "high",
        "critical",
    } else "medium"
    tags = value.get("tags")
    if not isinstance(tags, list):
        tags = []
    return {
        "symptom": sanitize_text(value.get("symptom")),
        "cause": sanitize_text(value.get("cause")),
        "action": sanitize_text(value.get("action")),
        "result": result,
        "severity": severity,
        "tags": [tag for tag in (sanitize_text(t) for t in tags[:5]) if tag],
    }


def build_import_record(row: dict[str, Any], extracted: dict[str, Any]) -> dict[str, Any]:
    clean = normalize_extracted(extracted)
    title = truncate(row.get("TITLE"), 500) or "(제목 없음)"
    return {
        "source_key": build_source_key(row),
        "original_seq": parse_int(row.get("SEQ")),
        "higher_category": truncate(row.get("HIGHER_NM"), 100),
        "lower_category": truncate(row.get("LOWER_NM"), 100),
        "app_menu": truncate(row.get("APP_MENU"), 500),
        "process_type": truncate(row.get("PROCESS_NM"), 100),
        "title": title,
        "symptom": clean["symptom"],
        "cause": clean["cause"],
        "action": clean["action"],
        "result": clean["result"],
        "request_company": truncate(row.get("REQUEST_COMPANY_NM"), 100),
        "manager_team": truncate(row.get("MANAGER_DEPT_NM"), 100),
        "cluster_id": None,
        "cluster_label": None,
        "is_digest": False,
        "severity": clean["severity"],
        "resolved": str(row.get("SOLUTION_FLAG", "")).upper() == "Y",
        "urgency": str(row.get("PROCESS_SPEED", "")).upper() == "Y",
        "work_hours": parse_float(row.get("WORK_TIME")),
        "requested_at": parse_oracle_datetime(row.get("REGISTER_DATE")),
        "resolved_at": parse_oracle_datetime(row.get("COMPLETE_DATE")),
        "sensitivity": "INTERNAL",
        "tags": clean["tags"],
        "source": {
            "enter_cd": truncate(row.get("ENTER_CD"), 50),
            "yyyy": truncate(row.get("YYYY"), 4),
            "mm": truncate(row.get("MM"), 2),
            "higher_cd": truncate(row.get("HIGHER_CD"), 50),
            "lower_cd": truncate(row.get("LOWER_CD"), 50),
            "status_cd": truncate(row.get("STATUS_CD"), 50),
            "status_nm": truncate(row.get("STATUS_NM"), 100),
            "process_cd": truncate(row.get("PROCESS_CD"), 50),
            "valuation": truncate(row.get("VALUATION"), 50),
            "gubun_cd": truncate(row.get("GUBUN_CD"), 10),
        },
    }


def build_user_message(row: dict[str, Any]) -> str:
    content = sanitize_text(row.get("CONTENT_TEXT")) or ""
    complete = (
        sanitize_text(row.get("COMPLETE_TEXT"))
        or sanitize_text(row.get("COMPLETE_CONTENT1"))
        or ""
    )
    return f"""## 요청 제목
{sanitize_text(row.get("TITLE")) or ""}

## 메뉴 경로
{sanitize_text(row.get("APP_MENU")) or ""}

## 원문 문의
{content[:3000]}

## 답변/조치
{complete[:3000]}

## 처리구분
{sanitize_text(row.get("PROCESS_NM")) or ""}

## 해결여부
{sanitize_text(row.get("SOLUTION_FLAG")) or ""}"""


def is_empty_case(row: dict[str, Any]) -> bool:
    content = sanitize_text(row.get("CONTENT_TEXT")) or ""
    complete = (
        sanitize_text(row.get("COMPLETE_TEXT"))
        or sanitize_text(row.get("COMPLETE_CONTENT1"))
        or ""
    )
    return len(content.strip()) < 10 and len(complete.strip()) < 10


async def call_openai(client: Any, row: dict[str, Any], model: str, retries: int) -> dict[str, Any]:
    message = build_user_message(row)
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": message},
                ],
                response_format={"type": "json_schema", "json_schema": CASE_SCHEMA},
                temperature=0.1,
                max_tokens=500,
            )
            content = response.choices[0].message.content
            return normalize_extracted(json.loads(content))
        except Exception as exc:  # noqa: BLE001 - retry and surface final provider error
            last_error = exc
            if attempt >= retries:
                break
            await asyncio.sleep(min(30, 2**attempt))
    raise RuntimeError(f"OpenAI normalization failed: {last_error}") from last_error


async def normalize_row(
    row: dict[str, Any],
    client: Any | None,
    model: str,
    retries: int,
    mode: str = "llm",
) -> dict[str, Any]:
    if is_empty_case(row):
        extracted = extract_empty_case(row)
    elif mode == "heuristic":
        # API 없이 규칙 기반 정규화
        extracted = extract_heuristic(row)
    elif client is not None:
        extracted = await call_openai(client, row, model, retries)
    else:
        raise RuntimeError("OpenAI client is required for LLM mode. Use --mode heuristic.")
    return build_import_record(row, extracted)


def load_done_keys(output: Path) -> set[str]:
    done: set[str] = set()
    if not output.exists():
        return done
    with output.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            source_key = record.get("source_key")
            if isinstance(source_key, str) and source_key:
                done.add(source_key)
                continue
    return done


async def run(args: argparse.Namespace) -> int:
    load_env_file()  # .env에서 OPENAI_API_KEY 등 자동 로드
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    done = load_done_keys(output_path) if args.resume else set()

    mode = args.mode  # "heuristic" or "llm"
    client: Any | None = None

    if mode == "llm":
        api_key = validate_openai_api_key(os.environ.get("OPENAI_API_KEY"))
        if api_key is None:
            raise SystemExit(
                "Missing OPENAI_API_KEY. Use --mode heuristic for API-free normalization."
            )

        def get_client() -> Any:
            nonlocal client
            if client is None:
                try:
                    from openai import AsyncOpenAI
                except ImportError as exc:
                    raise SystemExit(
                        "Missing Python package 'openai'. Install it in your Python environment."
                    ) from exc
                client = AsyncOpenAI(api_key=api_key)
            return client
    else:
        print(f"[mode=heuristic] API-free normalization — no LLM cost", file=sys.stderr)
        def get_client() -> Any:
            return None

    semaphore = asyncio.Semaphore(args.concurrency)
    written = 0
    skipped = 0
    started = time.time()

    async def guarded(row: dict[str, Any]) -> dict[str, Any]:
        async with semaphore:
            row_client = None if (is_empty_case(row) or mode == "heuristic") else get_client()
            return await normalize_row(row, row_client, args.model, args.retries, mode=mode)

    dropped = 0
    pending: set[asyncio.Task[dict[str, Any]]] = set()
    file_mode = "a" if args.resume else "w"
    with input_path.open("r", encoding="utf-8-sig", newline="") as input_handle, output_path.open(file_mode, encoding="utf-8") as output_handle:
        reader = csv.DictReader(input_handle, delimiter="\t")
        for row in reader:
            row_key = build_source_key(row)
            if row_key in done:
                skipped += 1
                continue
            pending.add(asyncio.create_task(guarded(row)))
            if len(pending) >= args.concurrency:
                done_tasks, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done_tasks:
                    record = task.result()
                    if args.drop_empty and not record.get("symptom") and not record.get("action"):
                        dropped += 1
                        continue
                    output_handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                    written += 1
            if args.limit and written + len(pending) >= args.limit:
                break
        for task in asyncio.as_completed(pending):
            record = await task
            if args.drop_empty and not record.get("symptom") and not record.get("action"):
                dropped += 1
                continue
            output_handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1

    elapsed = time.time() - started
    stats: dict[str, Any] = {"written": written, "skipped": skipped, "seconds": round(elapsed, 2)}
    if args.drop_empty:
        stats["dropped_empty"] = dropped
    print(json.dumps(stats, ensure_ascii=False))
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize TSVD999 TSV export into Jarvis JSONL.")
    parser.add_argument("--input", required=True, help="Path to UTF-8 TSV export from TSVD999.")
    parser.add_argument("--output", default="data/cases/normalized_cases.jsonl")
    parser.add_argument("--mode", choices=["llm", "heuristic"], default="heuristic",
                        help="'heuristic' (default, no API cost) or 'llm' (requires OPENAI_API_KEY)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--resume", action="store_true", help="Append and skip already normalized original_seq values.")
    parser.add_argument("--drop-empty", action="store_true",
                        help="Drop cases where both symptom and action are NULL (title-only garbage).")
    parser.add_argument("--limit", type=int, default=0, help="Optional max rows for smoke tests.")
    return parser.parse_args(argv)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args(sys.argv[1:]))))
