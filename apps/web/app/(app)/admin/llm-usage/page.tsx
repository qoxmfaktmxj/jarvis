import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listLlmUsage } from "@/lib/server/repositories/llm-usage";
import { LlmUsageGridContainer } from "./_components/LlmUsageGridContainer";

export default async function LlmUsagePage() {
  const session = await requirePagePermission(PERMISSIONS.LLM_USAGE_READ, "/admin/llm-usage");
  const t = await getTranslations("Admin.LlmUsage");
  const initial = await listLlmUsage({ workspaceId: session.workspaceId }, { page: 1, limit: 100 });
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <LlmUsageGridContainer initialRows={initial.rows} total={initial.total} />
    </PageShell>
  );
}
