'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KnowledgeMarkdown } from '@/components/knowledge/KnowledgeMarkdown';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Bold,
  Code2,
  Edit3,
  Eye,
  Image as ImageIcon,
  Italic,
  Link2,
} from 'lucide-react';

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

function slugify(text: string) {
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
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || placeholder;

  return (
    textarea.value.slice(0, start) +
    before +
    selected +
    after +
    textarea.value.slice(end)
  );
}

export function PageEditor({
  mode,
  pageId,
  initialValues = {},
}: PageEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialValues.title ?? '');
  const [slug, setSlug] = useState(initialValues.slug ?? '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(
    !!initialValues.slug,
  );
  const [pageType, setPageType] = useState(initialValues.pageType ?? 'project');
  const [sensitivity, setSensitivity] = useState(
    initialValues.sensitivity ?? 'INTERNAL',
  );
  const [mdxContent, setMdxContent] = useState(
    initialValues.mdxContent ?? '',
  );
  const [tagsInput, setTagsInput] = useState(
    (initialValues.tags ?? []).join(', '),
  );
  const [summary, setSummary] = useState(initialValues.summary ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [activeTab, setActiveTab] = useState('write');
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (mode === 'create' && !slugManuallyEdited) {
        setSlug(slugify(value));
      }
    },
    [mode, slugManuallyEdited],
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlug(value);
    setSlugManuallyEdited(true);
  }, []);

  const applyFormat = useCallback(
    (before: string, after = '', placeholder = '') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      setMdxContent(insertAtCursor(textarea, before, after, placeholder));
      requestAnimationFrame(() => textarea.focus());
    },
    [],
  );

  const handleSave = useCallback(() => {
    setError(null);

    startTransition(async () => {
      try {
        const tags = tagsInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

        const url =
          mode === 'create' ? '/api/knowledge' : `/api/knowledge/${pageId}`;
        const method = mode === 'create' ? 'POST' : 'PUT';
        const body =
          mode === 'create'
            ? {
                slug,
                title,
                pageType,
                sensitivity,
                mdxContent,
                changeNote: changeNote || 'Initial version',
                frontmatter: { tags, summary },
              }
            : {
                title,
                sensitivity,
                mdxContent,
                changeNote: changeNote || 'Updated content',
                frontmatter: { tags, summary },
                summary,
              };

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setError(data.error ?? 'Save failed');
          return;
        }

        const data = (await response.json()) as { page?: { id: string } };
        const targetId = mode === 'create' ? data.page?.id : pageId;
        router.push(targetId ? `/knowledge/${targetId}` : '/knowledge');
      } catch {
        setError('Network error, please try again.');
      }
    });
  }, [
    changeNote,
    mdxContent,
    mode,
    pageId,
    pageType,
    router,
    sensitivity,
    slug,
    summary,
    tagsInput,
    title,
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {mode === 'create' ? 'New Knowledge Page' : 'Edit Page'}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? 'Saving...'
              : mode === 'create'
                ? 'Create Page'
                : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder="Page title"
          />
        </div>

        {mode === 'create' && (
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="page-slug"
              className="font-mono text-sm"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Page Type</Label>
          <Select
            value={pageType}
            onValueChange={setPageType}
            disabled={mode === 'edit'}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
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
              {SENSITIVITIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
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
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Brief description of this page"
            rows={2}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="security, onboarding, aws"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {tagsInput
              .split(',')
              .map((tag) => tag.trim())
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
              onChange={(event) => setChangeNote(event.target.value)}
              placeholder="Describe what changed in this version"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Content (Markdown)</Label>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-2 flex items-center justify-between">
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
                <ImageIcon className="h-4 w-4" />
              </Button>
            </div>

            <TabsList className="h-8">
              <TabsTrigger value="write" className="text-xs">
                <Edit3 className="mr-1 h-3 w-3" /> Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="mr-1 h-3 w-3" /> Preview
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="write" className="mt-0">
            <Textarea
              ref={textareaRef}
              value={mdxContent}
              onChange={(event) => setMdxContent(event.target.value)}
              placeholder="Write your content in Markdown..."
              className="min-h-[500px] resize-y font-mono text-sm"
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <div className="min-h-[500px] rounded-md border border-gray-200 bg-white p-4">
              <KnowledgeMarkdown content={mdxContent} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
