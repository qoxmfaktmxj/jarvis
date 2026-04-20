"use client";

type RevenueRow = { yearMonth: string; amount: string };

const fmt = new Intl.NumberFormat("ko-KR");

export function RevenueHeatmap({ data, year }: { data: RevenueRow[]; year: number }) {
  const map = new Map(data.map((d) => [d.yearMonth, Number(d.amount)]));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const max = Math.max(...Array.from(map.values()), 1);
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 text-left">{year}년</th>
          {months.map((m) => (
            <th key={m} className="px-2 py-1">
              {m}월
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="px-2 py-1">매출</td>
          {months.map((m) => {
            const key = `${year}-${m}`;
            const v = map.get(key) ?? 0;
            const intensity = max > 0 ? Math.round((v / max) * 100) : 0;
            return (
              <td
                key={m}
                className="px-2 py-1 text-center"
                style={{ backgroundColor: `rgba(37, 99, 235, ${intensity / 100})` }}
              >
                {v > 0 ? fmt.format(v) : ""}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
