"use client";
/**
 * apps/web/components/grid/cells/EditableNumericCell.tsx
 *
 * 인라인 편집 셀: 정수(integer) 또는 소수(decimal/numeric) 입력.
 *
 * 두 모드 지원 (discriminated by `mode` prop, 기본값 "integer"):
 *
 *   mode="integer" (default — backwards compatible):
 *     - value: number | null
 *     - onChange: (next: number | null) => void
 *     - 정규식 /^-?\d+$/ 통과 시에만 commit
 *     - 사용처: sortOrder, personCnt 등 Zod `.int()` 컬럼
 *
 *   mode="decimal":
 *     - value: string | null     (DB Drizzle `numeric()` SoT — 정밀도 보존)
 *     - onChange: (next: string | null) => void
 *     - 정규식 /^-?\d+(\.\d+)?$/ 통과 시 commit
 *     - 사용처: amt / vatAmt / monthAmt / totalAmt / planRate 등 `numeric` 컬럼
 *
 * 표시:
 *   - integer: Number(value).toLocaleString("ko-KR")  → "1,234,567"
 *   - decimal: parseFloat(value).toLocaleString("ko-KR", { maximumFractionDigits: 20 })
 *     (단, trailing zeros 보존 위해 소수점 이하는 원본 문자열 사용)
 *
 * P0-1 / P0-2 (A5 audit 2026-05-11):
 *   기존 `/^-?\d+$/` 만 통과시키던 검증이 `numeric` 컬럼(소수)을 silently revert
 *   시키고, `Number(val)` → `String(next)` 직렬화가 큰 수의 정밀도를 손실시켰음.
 *   decimal 모드 도입 + integer 모드에서는 기존 동작 유지.
 */
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type CommonProps = {
  align?: "left" | "right" | "center";
  readOnly?: boolean;
  className?: string;
};

export type IntegerProps = CommonProps & {
  mode?: "integer";
  value: number | null;
  onChange: (next: number | null) => void;
};

export type DecimalProps = CommonProps & {
  mode: "decimal";
  value: string | null;
  onChange: (next: string | null) => void;
};

export type EditableNumericCellProps = IntegerProps | DecimalProps;

const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function formatDisplay(value: number | string | null, mode: "integer" | "decimal"): string {
  if (value === null || value === "" || value === undefined) return "";
  if (mode === "integer") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString("ko-KR") : "";
  }
  // decimal: preserve trailing zeros by splitting integer / fractional part
  const raw = typeof value === "string" ? value : String(value);
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart] = body.split(".");
  const intNumber = Number(intPart);
  if (!Number.isFinite(intNumber)) return raw; // fallback: show raw if unparseable
  const formattedInt = intNumber.toLocaleString("ko-KR");
  const formatted = fracPart !== undefined ? `${formattedInt}.${fracPart}` : formattedInt;
  return negative ? `-${formatted}` : formatted;
}

export function EditableNumericCell(props: EditableNumericCellProps) {
  const mode = props.mode ?? "integer";
  const { value, align = "right", readOnly, className } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.replace(/,/g, "").trim();
    if (trimmed === "") {
      if (mode === "integer") {
        (props as IntegerProps).onChange(null);
      } else {
        (props as DecimalProps).onChange(null);
      }
    } else if (mode === "integer" && INTEGER_RE.test(trimmed)) {
      (props as IntegerProps).onChange(Number(trimmed));
    } else if (mode === "decimal" && DECIMAL_RE.test(trimmed)) {
      // Preserve raw string to keep precision + trailing zeros (Drizzle numeric SoT).
      (props as DecimalProps).onChange(trimmed);
    }
    // invalid → no onChange (revert silently)
    setEditing(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") {
      setDraft(value === null ? "" : String(value));
      setEditing(false);
    }
  }

  if (editing && !readOnly) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={mode === "decimal" ? "decimal" : "numeric"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className={cn(
          "w-full px-2 py-1 text-[13px] outline-none ring-2 ring-(--border-focus) ring-inset",
          className,
        )}
      />
    );
  }

  return (
    <div
      onClick={() => {
        if (!readOnly) {
          setDraft(value === null ? "" : String(value));
          setEditing(true);
        }
      }}
      className={cn(
        "px-2 py-1 text-[13px]",
        !readOnly && "cursor-pointer",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {formatDisplay(value, mode)}
    </div>
  );
}
