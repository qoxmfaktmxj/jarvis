"use client";
import { Picker } from "./Picker";

// `userId` is the user table PK (uuid). Sales edit forms need it to populate
// uuid columns like `insUserId` / `attendeeUserId`. Without it the picker
// would only expose sabun (varchar) which would fail server-side uuid parsing.
// `email` mirrors `user.email` nullability — guard before rendering so rows
// without an email don't surface as misleading "()" suffixes.
export type EmployeeHit = { userId: string; sabun: string; name: string; email: string | null };

type Props = {
  value: string;
  onSelect: (hit: EmployeeHit) => void;
  search: (q: string, limit: number) => Promise<EmployeeHit[]>;
  placeholder?: string;
};

export function EmployeePicker({ value, onSelect, search, placeholder }: Props) {
  return (
    <Picker<EmployeeHit>
      value={value}
      onSelect={onSelect}
      search={search}
      placeholder={placeholder}
      minChars={2}
      listboxIdPrefix="employee"
      itemKey={(h) => h.sabun}
      displayValueOf={(h) => h.sabun}
      renderItem={(h) => (
        <>
          <span className="font-mono">{h.sabun}</span>
          {" · "}
          <span>{h.name}</span>
          {h.email ? (
            <>
              {" "}
              <span className="text-(--fg-muted)">({h.email})</span>
            </>
          ) : null}
        </>
      )}
    />
  );
}
