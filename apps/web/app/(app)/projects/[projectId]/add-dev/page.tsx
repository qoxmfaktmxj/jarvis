import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function ProjectAddDevTabPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  await params;
  return (
    <div className="rounded-md border border-dashed border-surface-300 p-8 text-center text-surface-500">
      이 프로젝트의 추가개발 건 목록은 P5에서 연결됩니다.
    </div>
  );
}
