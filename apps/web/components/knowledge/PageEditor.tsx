'use client';

import { useState, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bold, Italic, Code2, Link2, Image, Eye, Edit3 } from 'lucide-react';

const PAGE_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'system', label: 'System' },
  { value: 'access', label: 'Access' },
  { value: 'runbook', label: 'Runbook' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'hr-policy', label: 'HR Policy' },
  { value: 'tool-guide', label: 'Tool Guide' },
  { value: 'faq', label: 'FAQ' },
  { value: 'decision', label: 'Decision' },
  { value: 'incident', label: 'Incident' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'glossary', label: 'Glossary' },
] as const;

const SENSITIVITIES = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'SECRET_REF_ONLY', label: 'Secret (ref only)' },
] as const;

export interface PageEditorProps {
  mode: 'create' | 'edit';
  pageId?: string;
  initialValues?: {
    slug?: string;
    title?: string;
    pageType?: string;
    sensitivity?: string;
    mdxContent?: string;
    tags?: string[];
    summary?: string;
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  before: string,
  after = '',
  placeholder = '',
): string {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;
  const newValue =
    textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
  return newValue;
}

export function PageEditor({ mode, pageId, initialValues = {} }: PageEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialValues.title ?? '');
  const [slug, setSlug] = useState(initialValues.slug ?? '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!initialValues.slug);
  const [pageType, setPageType] = useState(initialValues.pageType ?? 'project');
  const [sensitivity, setSensitivity] = useState(initialValues.sensitivity ?? 'INTERNAL');
  const [mdxContent, setMdxContent] = useState(initialValues.mdxContent ?? '');
  const [tagsInput, setTagsInput] = useState((initialValues.tags ?? []).join(', '));
  const [summary, setSummary] = useState(initialValues.summary ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('write');
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-generate slug from title in create mode
  const handleTitleChange = useCallback(
    (val: string) => {
      setTitle(val);
      if (mode === 'create' && !slugManuallyEdited) {
        setSlug(slugify(val));
      }
    },
    [mode, slugManuallyEdited],
  );

  const handleSlugChange = useCallback((val: string) => {
    setSlug(val);
    setSlugManuallyEdited(true);
  }, []);

  // Toolbar helpers
  const applyFormat = useCallback(
    (before: string, after = '', placeholder = '') => {
      const ta = textareaRef.current;
      if (!ta) return;
      const newValue = insertAtCursor(ta, before, after, placeholder);
      setMdxContent(newValue);
      // Restore focus after state update
      requestAnimationFrame(() => ta.focus());
    },
    [],
  );

  // Load preview via server action / API
  const handleTabChange = useCallback(
    async (tab: string) => {
      setActiveTab(tab);
      if (tab === 'preview' && mdxContent) {
        try {
          const res = await fetch('/api/knowledge/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mdxContent }),
          });
          if (res.ok) {
            const { html } = await res.json() as { html: string };
            setPreviewHtml(html);
          }
        } catch {
          setPreviewHtml('<p class="text-gray-400 italic">Preview unavailable.</p>');
        }
      }
    },
    [mdxContent],
  );

  const handleSave = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const url = mode === 'create' ? '/api/knowledge' : `/api/knowledge/${pageId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';

        const body =
          mode === 'create'
            ? { slug, title, pageType, sensitivity, mdxContent, changeNote: changeNote || 'Initial version', frontmatter: { tags, summary } }
            : { title, sensitivity, mdxContent, changeNote: changeNote || 'Updated content', frontmatter: { tags, summary }, summary };

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json() as { error?: string };
          setError(data.error ?? 'Save failed');
          return;
        }

        const data = await res.json() as { page?: { id: string } };
        const targetId = mode === 'create' ? data.page?.id : pageId;
        if (targetId) {
          router.push(`/knowledge/${targetId}`);
        } else {
          router.push('/knowledge');
        }
      } catch {
        setError('Network error — please try again');
      }
    });
  }, [mode, pageId, slug, title, pageType, sensitivity, mdxContent, tagsInput, summary, changeNote, router]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{mode === 'create' ? 'New Knowledge Page' : 'Edit Page'}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : mode === 'create' ? 'Create Page' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Metadata fields */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Page title"
          />
        </div>

        {mode === 'create' && (
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="page-slug"
              className="font-mono text-sm"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Page Type</Label>
          <Select value={pageType} onValueChange={setPageType} disabled={mode === 'edit'}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Sensitivity</Label>
          <Select value={sensitivity} onValueChange={setSensitivity}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENSITIVITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief description of this page"
            rows={2}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="security, onboarding, aws"
          />
          <div className="flex flex-wrap gap-1 mt-1">
            {tagsInput
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
          </div>
        </div>

        {mode === 'edit' && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="changeNote">Change Note</Label>
            <Input
              id="changeNote"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Describe what changed in this version"
            />
          </div>
        )}
      </div>

      {/* MDX editor */}
      <div className="space-y-2">
        <Label>Content (MDX)</Label>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between mb-2">
            {/* Formatting toolbar */}
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('**', '**', 'bold text')}
                title="Bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('_', '_', 'italic text')}
                title="Italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('`', '`', 'code')}
                title="Inline code"
              >
                <Code2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('\n```\n', '\n```\n', 'code block')}
                title="Code block"
              >
                <Code2 className="h-4 w-4 opacity-60" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('[', '](url)', 'link text')}
                title="Link"
              >
                <Link2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyFormat('![alt](', ')', 'image-url')}
                title="Image"
              >
                <Image className="h-4 w-4" />
              </Button>
            </div>

            <TabsList className="h-8">
              <TabsTrigger value="write" className="text-xs">
                <Edit3 className="h-3 w-3 mr-1" /> Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="h-3 w-3 mr-1" /> Preview
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="write" className="mt-0">
            <Textarea
              ref={textareaRef}
              value={mdxContent}
              onChange={(e) => setMdxContent(e.target.value)}
              placeholder="Write your content in MDX..."
              className="min-h-[500px] font-mono text-sm resize-y"
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <div className="min-h-[500px] rounded-md border border-gray-200 p-4 bg-white">
              {previewHtml ? (
                <div
                  className="mdx-content"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="text-gray-400 italic text-sm">
                  Loading preview…
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
