import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type ProjectTableRow = {
  id: string;
  companyCode: string | null;
  companyName: string | null;
  name: string;
  prodDomainUrl: string | null;
  devDomainUrl: string | null;
  status: string;
  sensitivity: string;
  ownerName: string | null;
  updatedAt: Date;
};

export function ProjectTable({ data }: { data: ProjectTableRow[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-surface-500">프로젝트가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-surface-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface-50 text-[13px] text-surface-600">
          <tr>
            <th className="px-3 py-2 text-left">회사코드</th>
            <th className="px-3 py-2 text-left">회사명</th>
            <th className="px-3 py-2 text-left">시스템명</th>
            <th className="px-3 py-2 text-left">운영 URL</th>
            <th className="px-3 py-2 text-left">개발 URL</th>
            <th className="px-3 py-2 text-left">상태</th>
            <th className="px-3 py-2 text-left">민감도</th>
            <th className="px-3 py-2 text-left">담당자</th>
            <th className="px-3 py-2 text-left">업데이트</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50">
              <td className="px-3 py-2 font-mono text-xs">{r.companyCode ?? "—"}</td>
              <td className="px-3 py-2">
                <Link href={`/projects/${r.id}`} className="text-isu-600 hover:underline">
                  {r.companyName ?? "—"}
                </Link>
              </td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-xs">
                {r.prodDomainUrl ? (
                  <a
                    href={r.prodDomainUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {r.prodDomainUrl.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.devDomainUrl ? (
                  <a
                    href={r.devDomainUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {r.devDomainUrl.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                <Badge variant={r.status === "active" ? "success" : "warning"}>
                  {r.status}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline">{r.sensitivity}</Badge>
              </td>
              <td className="px-3 py-2">{r.ownerName ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-surface-500">
                {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" }).format(
                  new Date(r.updatedAt)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
