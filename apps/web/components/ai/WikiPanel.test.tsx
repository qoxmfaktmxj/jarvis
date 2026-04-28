// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { WikiPanel } from './WikiPanel';

describe('WikiPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async (url) => {
      const u = new URL(url as string, 'http://localhost');
      const path = u.searchParams.get('path');
      if (path === 'first.md') {
        return new Response(
          JSON.stringify({
            meta: { id: '1', title: 'First', sensitivity: 'INTERNAL', slug: 'first', path: 'first.md', updatedAt: '2024-01-01T00:00:00.000Z', workspaceId: 'ws1', frontmatter: {} },
            body: 'See [[second-page]]',
            orphanSlugs: [],
          }),
          { status: 200 },
        );
      }
      if (path === 'second-page.md') {
        return new Response(
          JSON.stringify({
            meta: { id: '2', title: 'Second', sensitivity: 'INTERNAL', slug: 'second-page', path: 'second-page.md', updatedAt: '2024-01-01T00:00:00.000Z', workspaceId: 'ws1', frontmatter: {} },
            body: '# Second',
            orphanSlugs: [],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    }) as typeof fetch;
  });

  it('renders title after fetch', async () => {
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument());
  });

  it('shows error state on 404', async () => {
    render(<WikiPanel workspaceId="ws1" slug="missing" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/not found|찾을 수 없|404/i)).toBeInTheDocument());
  });

  it('navigates to a new slug when [[wikilink]] is clicked, pushes to back-stack', async () => {
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'First' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: /second-page/i })[0]!);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Second' }).length).toBeGreaterThan(0));
    expect(screen.getByLabelText(/뒤로|back/i)).not.toBeDisabled();
  });

  it('back button pops the stack', async () => {
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'First' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: /second-page/i })[0]!);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Second' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByLabelText(/뒤로|back/i));
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'First' }).length).toBeGreaterThan(0));
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={onClose} />);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'First' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByLabelText(/닫기|close/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
