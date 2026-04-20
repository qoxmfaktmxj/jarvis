type StaffRow = {
  id: string;
  userId: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
};

export function StaffTable({ data }: { data: StaffRow[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-surface-500">투입인력이 없습니다.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-surface-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface-50 text-[13px] text-surface-600">
          <tr>
            <th className="px-3 py-2 text-left">사용자 ID</th>
            <th className="px-3 py-2 text-left">역할</th>
            <th className="px-3 py-2 text-left">시작일</th>
            <th className="px-3 py-2 text-left">종료일</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50">
              <td className="px-3 py-2 font-mono text-xs">{r.userId ?? "—"}</td>
              <td className="px-3 py-2">{r.role ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{r.startDate ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{r.endDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
