import type { Meta, StoryObj } from '@storybook/react';

/**
 * WikiEditor는 Tiptap + tiptap-markdown + lowlight + 커스텀 WikiLinkExtension을
 * 사용하므로 Storybook의 Vite/Webpack 환경에서 즉시 렌더가 까다롭다.
 * (CodeBlockLowlight, window.* 의존, dynamic-import wrapper 가정 등.)
 *
 * 디자인 재구성을 기다리는 단계이므로, 일단 placeholder 스토리만 노출하고
 * 실제 동작 검증은 e2e (`/wiki/manual/[workspaceId]/edit/[path]`)에서 수행한다.
 * 후속 작업으로 mock 가능해지면 실제 <WikiEditor /> 렌더로 교체.
 */

const meta: Meta = {
  title: 'Wiki/WikiEditor',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;

export const Placeholder: StoryObj = {
  render: () => (
    <div
      style={{
        padding: 20,
        border: '1px solid #ccc',
        borderRadius: 8,
        background: '#fff',
        maxWidth: 720,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: '#374151' }}>
        WikiEditor — Tiptap 기반 에디터
      </p>
      <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
        Storybook에서 직접 렌더하지 않고 placeholder만 노출합니다.
      </p>
      <p style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
        실제 동작은 <code>/wiki/manual/[workspaceId]/edit/[path]</code> 또는 e2e 스위트에서
        확인하세요.
      </p>
    </div>
  ),
};
