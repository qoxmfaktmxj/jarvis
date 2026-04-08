import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/server/api-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// POST /api/knowledge/preview -- return escaped raw content only
export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { mdxContent } = body as { mdxContent?: string };
  if (!mdxContent || typeof mdxContent !== 'string') {
    return NextResponse.json({ error: 'mdxContent is required' }, { status: 422 });
  }

  return NextResponse.json({
    html: `<pre class="whitespace-pre-wrap text-sm text-gray-700">${escapeHtml(mdxContent)}</pre>`,
  });
}
