import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { InquiryTable } from "@/components/project/InquiryTable";
import { listProjectInquiries } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function ProjectInquiriesPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const inquiries = await listProjectInquiries({
    workspaceId: session.workspaceId,
    projectId
  });

  if (!inquiries) {
    notFound();
  }

  return <InquiryTable projectId={projectId} items={inquiries} />;
}
