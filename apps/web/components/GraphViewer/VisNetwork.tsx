// apps/web/components/GraphViewer/VisNetwork.tsx
'use client';

import { useEffect, useRef } from 'react';

export type GraphNode = {
  id: string;
  label: string;
  group?: string;
  size?: number;
  pageSlug?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  weight?: number;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

interface VisNetworkProps {
  data: GraphData;
  onNodeClick: (nodeId: string, pageSlug?: string) => void;
  height?: string;
}

// Distinct colors for groups (HR, IT, Legal, Process, Org, etc.)
const GROUP_COLORS: Record<string, { background: string; border: string; highlight: { background: string; border: string } }> = {
  hr: {
    background: '#fde68a',
    border: '#d97706',
    highlight: { background: '#fcd34d', border: '#b45309' },
  },
  it: {
    background: '#bfdbfe',
    border: '#2563eb',
    highlight: { background: '#93c5fd', border: '#1d4ed8' },
  },
  legal: {
    background: '#fecaca',
    border: '#dc2626',
    highlight: { background: '#fca5a5', border: '#b91c1c' },
  },
  process: {
    background: '#bbf7d0',
    border: '#16a34a',
    highlight: { background: '#86efac', border: '#15803d' },
  },
  org: {
    background: '#e9d5ff',
    border: '#9333ea',
    highlight: { background: '#d8b4fe', border: '#7e22ce' },
  },
  default: {
    background: '#e5e7eb',
    border: '#6b7280',
    highlight: { background: '#d1d5db', border: '#4b5563' },
  },
};

export function VisNetwork({ data, onNodeClick, height = '600px' }: VisNetworkProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Use `unknown` for the network instance to avoid pulling vis-network types into the SSR bundle.
  const networkRef = useRef<{ destroy: () => void } | null>(null);
  // Keep a fresh reference to the click handler so the listener does not need to rebind on every render.
  const onNodeClickRef = useRef(onNodeClick);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    let cancelled = false;

    if (!containerRef.current) return;

    // Build a slug lookup so the click handler can resolve pageSlug without re-parsing nodes.
    const slugById = new Map<string, string | undefined>();
    for (const node of data.nodes) {
      slugById.set(node.id, node.pageSlug);
    }

    // Style nodes per group
    const styledNodes = data.nodes.map((node) => {
      const palette = GROUP_COLORS[node.group ?? 'default'] ?? GROUP_COLORS.default;
      return {
        id: node.id,
        label: node.label,
        group: node.group,
        size: node.size ?? 16,
        shape: 'dot',
        color: palette,
        font: { size: 14, color: '#1f2937' },
      };
    });

    const styledEdges = data.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      width: edge.weight ?? 1,
      color: { color: '#9ca3af', highlight: '#6b7280' },
      smooth: { enabled: true, type: 'continuous', roundness: 0.2 },
      font: { size: 11, color: '#6b7280', align: 'middle' as const },
    }));

    void (async () => {
      const visModule = await import('vis-network/standalone');
      if (cancelled || !containerRef.current) return;

      const { Network, DataSet } = visModule;

      const nodesDataSet = new DataSet(styledNodes);
      const edgesDataSet = new DataSet(styledEdges);

      const options = {
        layout: {
          hierarchical: false,
        },
        physics: {
          enabled: true,
          stabilization: { enabled: true, iterations: 200 },
          barnesHut: {
            gravitationalConstant: -3000,
            springLength: 120,
          },
        },
        nodes: {
          shape: 'dot',
          borderWidth: 2,
        },
        edges: {
          arrows: { to: { enabled: false } },
        },
        interaction: {
          hover: true,
          tooltipDelay: 150,
        },
      };

      const network = new Network(
        containerRef.current,
        { nodes: nodesDataSet, edges: edgesDataSet },
        options,
      );

      network.on('click', (params: { nodes: string[] }) => {
        const nodeId = params.nodes[0];
        if (nodeId) {
          onNodeClickRef.current(nodeId, slugById.get(nodeId));
        }
      });

      networkRef.current = network as unknown as { destroy: () => void };
    })();

    return () => {
      cancelled = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      data-testid="vis-network-container"
      className="border rounded-lg bg-white"
      style={{ height, width: '100%' }}
    />
  );
}

export default VisNetwork;
