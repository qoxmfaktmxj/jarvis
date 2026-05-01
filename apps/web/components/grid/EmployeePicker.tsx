"use client";

import { useEffect, useState } from "react";
import { searchEmployees, type EmployeeMatch } from "@/lib/queries/employee-search";

export type EmployeePickerProps = {
  value: string;
  onSelect: (emp: EmployeeMatch) => void;
  placeholder?: string;
  disabled?: boolean;
};

const DEBOUNCE_MS = 300;

export function EmployeePicker({
  value,
  onSelect,
  placeholder = "사번/이름/이메일",
  disabled = false,
}: EmployeePickerProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<EmployeeMatch[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      const rows = await searchEmployees(query);
      setResults(rows);
      setOpen(rows.length > 0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
      />
      {open && results.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded border border-slate-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.employeeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(r);
                  setQuery(r.name);
                  setOpen(false);
                }}
                className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{r.name}</span>
                <span className="ml-2 text-slate-500">{r.employeeId}</span>
                <span className="ml-2 text-slate-400">{r.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
