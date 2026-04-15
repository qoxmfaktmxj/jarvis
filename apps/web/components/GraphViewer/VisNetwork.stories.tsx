import type { Meta, StoryObj } from '@storybook/react';
import { VisNetwork, type GraphData } from './VisNetwork';

const onNodeClick = (nodeId: string, pageSlug?: string) => console.log('node clicked:', nodeId, pageSlug);

// 10 nodes / 12 edges / 3 groups (hr, it, legal)
const DEFAULT_GRAPH: GraphData = {
  nodes: [
    { id: 'hr-1', label: '연차휴가 정책', group: 'hr', size: 20, pageSlug: 'hr/leaves/annual-leave' },
    { id: 'hr-2', label: '병가 신청 절차', group: 'hr', size: 16, pageSlug: 'hr/leaves/sick-leave' },
    { id: 'hr-3', label: '복리후생 안내', group: 'hr', size: 18, pageSlug: 'hr/welfare/benefits' },
    { id: 'it-1', label: 'VPN 설정 가이드', group: 'it', size: 18, pageSlug: 'it/vpn/setup' },
    { id: 'it-2', label: '비밀번호 정책', group: 'it', size: 16, pageSlug: 'it/security/password-policy' },
    { id: 'it-3', label: '계정 관리', group: 'it', size: 14 },
    { id: 'legal-1', label: 'NDA 안내', group: 'legal', size: 16, pageSlug: 'legal/contracts/nda' },
    { id: 'legal-2', label: '계약 검토 절차', group: 'legal', size: 14 },
    { id: 'legal-3', label: '개인정보 처리방침', group: 'legal', size: 18 },
    { id: 'hr-4', label: '온보딩 체크리스트', group: 'hr', size: 14 },
  ],
  edges: [
    { id: 'e1', from: 'hr-1', to: 'hr-2', label: '관련' },
    { id: 'e2', from: 'hr-1', to: 'hr-3' },
    { id: 'e3', from: 'hr-2', to: 'hr-3' },
    { id: 'e4', from: 'hr-3', to: 'hr-4', label: '참조' },
    { id: 'e5', from: 'it-1', to: 'it-2' },
    { id: 'e6', from: 'it-2', to: 'it-3', label: '연관' },
    { id: 'e7', from: 'it-1', to: 'it-3' },
    { id: 'e8', from: 'legal-1', to: 'legal-2' },
    { id: 'e9', from: 'legal-2', to: 'legal-3' },
    { id: 'e10', from: 'legal-1', to: 'legal-3', label: '참조' },
    { id: 'e11', from: 'hr-1', to: 'legal-3' },
    { id: 'e12', from: 'it-2', to: 'legal-3' },
  ],
};

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] };

const LARGE_GRAPH: GraphData = (() => {
  const groups = ['hr', 'it', 'legal', 'process', 'org'] as const;
  const nodes = Array.from({ length: 24 }, (_, i) => ({
    id: `n-${i}`,
    label: `노드 ${i}`,
    group: groups[i % groups.length],
    size: 12 + (i % 5) * 2,
  }));
  const edges = Array.from({ length: 30 }, (_, i) => ({
    id: `e-${i}`,
    from: `n-${i % 24}`,
    to: `n-${(i * 7 + 3) % 24}`,
  }));
  return { nodes, edges };
})();

const meta: Meta<typeof VisNetwork> = {
  title: 'Wiki/VisNetwork',
  component: VisNetwork,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    onNodeClick,
    height: '600px',
  },
};

export default meta;
type Story = StoryObj<typeof VisNetwork>;

// 1. Default — 기본 그래프 (10 nodes, 12 edges, 3 groups)
export const Default: Story = {
  args: {
    data: DEFAULT_GRAPH,
  },
};

// 2. EmptyGraph — 노드/엣지 없음
export const EmptyGraph: Story = {
  args: {
    data: EMPTY_GRAPH,
  },
};

// 3. LargeGraph — 24 nodes, 30 edges, 5 groups
export const LargeGraph: Story = {
  args: {
    data: LARGE_GRAPH,
  },
};
