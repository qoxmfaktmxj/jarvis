import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import EditPageClientShell from "./_client-shell";

interface EditPageProps {
  params: Promise<{
    workspaceId: string;
    path: string[];
  }>;
}

// Phase-W1 stub content. Real loading lands in Phase-W2 with a server query
// against the manual/ tree.
const MOCK_MARKDOWN = `---
title: Sample Manual Page
sensitivity: internal
tags: [onboarding, sample]
---

# Sample Manual Page

This is a **mock** manual page used for the Phase-W1 editor preview.

- Try \`[[onboarding/welcome]]\` to test wiki links.
- Toolbar covers headings, lists, bold/italic, code blocks.

\`\`\`ts
// Code blocks use lowlight for syntax highlighting.
export const hello = (name: string) => \`Hello, \${name}\`;
\`\`\`
`;

export default async function ManualWikiEditPage({ params }: EditPageProps) {
  const { workspaceId, path } = await params;
  const t = await getTranslations("WikiEditor");
  const slug = (path ?? []).join("/");

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
          <AlertDescription>{t("manualOnlyBanner")}</AlertDescription>
        </div>
      </Alert>

      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            wiki/manual/{slug}
          </h1>
          <p className="text-xs text-gray-500 mt-1">workspace: {workspaceId}</p>
        </div>
      </div>

      <EditPageClientShell
        initialContent={MOCK_MARKDOWN}
        workspaceId={workspaceId}
        pageSlug={slug}
      />
    </div>
  );
}
