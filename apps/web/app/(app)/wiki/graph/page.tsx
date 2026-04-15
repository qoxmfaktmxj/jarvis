// apps/web/app/(app)/wiki/graph/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { GraphViewerPage } from './_components/GraphViewerPage';
import type { GraphData } from '@/components/GraphViewer/VisNetwork';

interface Props {
  searchParams: Promise<{ snapshotId?: string }>;
}

export const dynamic = 'force-dynamic';

// Mock graph for development. Real data will be sourced from graph_snapshot / graph_node / graph_edge.
const MOCK_GRAPH: GraphData = {
  nodes: [
    // Roots / clusters
    { id: 'hr-root', label: 'HR', group: 'hr', size: 28, pageSlug: 'hr' },
    { id: 'it-root', label: 'IT', group: 'it', size: 28, pageSlug: 'it' },
    { id: 'legal-root', label: '법무', group: 'legal', size: 28, pageSlug: 'legal' },
    { id: 'process-root', label: '프로세스', group: 'process', size: 28, pageSlug: 'process' },
    { id: 'org-root', label: '조직', group: 'org', size: 28, pageSlug: 'org' },

    // HR
    { id: 'hr-annual-leave', label: '연차 사용', group: 'hr', size: 16, pageSlug: 'hr/annual-leave' },
    { id: 'hr-sick-leave', label: '병가', group: 'hr', size: 14, pageSlug: 'hr/sick-leave' },
    { id: 'hr-welfare', label: '복지 제도', group: 'hr', size: 16, pageSlug: 'hr/welfare' },

    // IT
    { id: 'it-vpn', label: 'VPN 접속', group: 'it', size: 16, pageSlug: 'it/vpn' },
    { id: 'it-password', label: '비밀번호 정책', group: 'it', size: 14, pageSlug: 'it/password' },
    { id: 'it-remote', label: '원격 근무 환경', group: 'it', size: 16, pageSlug: 'it/remote' },

    // Legal
    { id: 'legal-nda', label: 'NDA', group: 'legal', size: 16, pageSlug: 'legal/nda' },
    { id: 'legal-ip', label: '지식재산권', group: 'legal', size: 14, pageSlug: 'legal/ip' },

    // Process
    { id: 'process-purchase', label: '구매 요청', group: 'process', size: 16, pageSlug: 'process/purchase' },
    { id: 'process-approval', label: '결재 흐름', group: 'process', size: 18, pageSlug: 'process/approval' },
  ],
  edges: [
    // HR root → leaves
    { id: 'e-hr-1', from: 'hr-root', to: 'hr-annual-leave' },
    { id: 'e-hr-2', from: 'hr-root', to: 'hr-sick-leave' },
    { id: 'e-hr-3', from: 'hr-root', to: 'hr-welfare' },

    // IT root → leaves
    { id: 'e-it-1', from: 'it-root', to: 'it-vpn' },
    { id: 'e-it-2', from: 'it-root', to: 'it-password' },
    { id: 'e-it-3', from: 'it-root', to: 'it-remote' },

    // Legal root → leaves
    { id: 'e-legal-1', from: 'legal-root', to: 'legal-nda' },
    { id: 'e-legal-2', from: 'legal-root', to: 'legal-ip' },

    // Process root → leaves
    { id: 'e-process-1', from: 'process-root', to: 'process-purchase' },
    { id: 'e-process-2', from: 'process-root', to: 'process-approval' },

    // Cross-cluster relationships
    { id: 'e-cross-1', from: 'hr-annual-leave', to: 'process-approval', label: '결재 필요', weight: 2 },
    { id: 'e-cross-2', from: 'process-purchase', to: 'process-approval', label: '결재 필요', weight: 2 },
    { id: 'e-cross-3', from: 'it-remote', to: 'it-vpn', label: '의존', weight: 1 },
    { id: 'e-cross-4', from: 'org-root', to: 'hr-root', label: '관할' },
    { id: 'e-cross-5', from: 'org-root', to: 'it-root', label: '관할' },
    { id: 'e-cross-6', from: 'legal-nda', to: 'hr-welfare', label: '연관' },
  ],
};

export default async function WikiGraphPage({ searchParams }: Props) {
  await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const t = await getTranslations('WikiGraph');
  const { snapshotId } = await searchParams;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        {snapshotId && (
          <p className="text-sm text-muted-foreground mt-1">snapshot: {snapshotId}</p>
        )}
        <p className="text-sm text-gray-500 mt-2">{t('clickToNavigate')}</p>
      </div>

      <GraphViewerPage data={MOCK_GRAPH} />
    </div>
  );
}
