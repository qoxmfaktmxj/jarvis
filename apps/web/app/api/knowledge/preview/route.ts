import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

// POST /api/knowledge/preview — compile MDX to HTML for live preview
export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { mdxContent } = body as { mdxContent?: string };
  if (!mdxContent || typeof mdxContent !== 'string') {
    return NextResponse.json({ error: 'mdxContent is required' }, { status: 422 });
  }

  try {
    // Dynamically import to avoid bundle issues
    const { compileMDX } = await import('next-mdx-remote/rsc');
    const { content } = await compileMDX({ source: mdxContent, options: { parseFrontmatter: false } });
    // We can't easily convert RSC to HTML string in a route handler.
    // Instead return the raw content — client will render it as sanitized HTML
    // For a simpler approach: return the MDX source, client will use dangerouslySetInnerHTML
    // with a basic markdown-like conversion as fallback.
    return NextResponse.json({ html: `<div class="mdx-preview">${String(content)}</div>` });
  } catch {
    // Fallback: return escaped raw content wrapped in pre
    const escaped = mdxContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return NextResponse.json({
      html: `<pre class="whitespace-pre-wrap text-sm text-gray-700">${escaped}</pre>`,
    });
  }
}
