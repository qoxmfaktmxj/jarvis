"use client";
import { Picker } from "./Picker";

export type CompanyHit = {
  id: string;
  code: string;
  name: string;
  objectDiv: string;
};

type Props = {
  value: string;
  onSelect: (hit: CompanyHit) => void;
  search: (q: string, limit: number) => Promise<CompanyHit[]>;
  placeholder?: string;
};

export function CompanyPicker({ value, onSelect, search, placeholder }: Props) {
  return (
    <Picker<CompanyHit>
      value={value}
      onSelect={onSelect}
      search={search}
      placeholder={placeholder}
      minChars={1}
      listboxIdPrefix="company"
      itemKey={(h) => h.id}
      displayValueOf={(h) => h.name}
      renderItem={(h) => (
        <>
          <span className="font-mono">{h.code}</span>
          {" · "}
          <span>{h.name}</span>
        </>
      )}
    />
  );
}
