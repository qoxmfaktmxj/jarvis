import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@jarvis/db/client', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));

import Page from '../page';

describe('admin llm-cost page', () => {
  it('renders cost dashboard with heading', async () => {
    const el = await Page();
    const html = renderToStaticMarkup(el);
    expect(html).toContain('LLM');
    expect(html.toLowerCase()).toMatch(/cost|비용/);
  });
});
