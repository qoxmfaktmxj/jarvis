import { describe, it, expect } from 'vitest';
import type { SourceRef, GraphSourceRef } from '../types.js';

describe('SourceRef discriminated union', () => {
  it('narrows to TextSourceRef when kind==="text"', () => {
    const src: SourceRef = {
      kind: 'text',
      pageId: 'p1',
      title: 't',
      url: '/knowledge/p1',
      excerpt: 'e',
      confidence: 0.8,
    };
    if (src.kind === 'text') {
      expect(src.pageId).toBe('p1');
    }
  });

  it('narrows to GraphSourceRef when kind==="graph"', () => {
    const src: SourceRef = {
      kind: 'graph',
      snapshotId: 's1',
      snapshotTitle: 'snap',
      nodeId: 'n1',
      nodeLabel: 'UserService',
      sourceFile: 'services/user.ts',
      communityLabel: 'Auth',
      url: '/architecture?snapshot=s1&node=n1',
      confidence: 0.7,
    };
    if (src.kind === 'graph') {
      expect(src.nodeLabel).toBe('UserService');
      expect(src.relationPath).toBeUndefined();
    }
  });

  it('GraphSourceRef accepts optional relationPath', () => {
    const src: GraphSourceRef = {
      kind: 'graph',
      snapshotId: 's1',
      snapshotTitle: 'snap',
      nodeId: 'a->b',
      nodeLabel: 'A → B',
      sourceFile: null,
      communityLabel: null,
      relationPath: ['A', 'B', 'C'],
      url: '/architecture?snapshot=s1',
      confidence: 0.7,
    };
    expect(src.relationPath).toEqual(['A', 'B', 'C']);
  });
});
