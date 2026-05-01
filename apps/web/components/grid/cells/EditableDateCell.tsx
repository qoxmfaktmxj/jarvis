"use client";
import { DatePicker } from "@/components/ui/DatePicker";

type Props = {
  value: string | null;
  onCommit: (next: string | null) => void;
};

export function EditableDateCell({ value, onCommit }: Props) {
  return (
    <DatePicker
      value={value}
      onChange={onCommit}
      className="h-full w-full border-0"
    />
  );
}
