"use client";

/**
 * RichTextEditor — generic Tiptap + markdown editor for non-wiki surfaces.
 * ----------------------------------------------------------------------------
 * This component is deliberately wiki-unaware: it does not know about
 * frontmatter, `[[wikilinks]]`, or workspace context. Those concerns live in
 * `<WikiEditor />`.
 *
 * Contract:
 *   - value:      initial markdown string (not re-applied on change)
 *   - onChange:   called with fresh markdown on every editor update
 *   - output:     currently only "markdown" is supported
 *   - features:   which Toolbar buttons to render
 *   - readOnly:   disables editing and hides the toolbar
 *   - minHeight:  min-height CSS value applied to the editor surface
 */
import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-text-style/color";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import { Toolbar, type ToolbarFeature } from "./Toolbar";

const lowlight = createLowlight(common);

export type RichTextEditorFeature = ToolbarFeature;

export interface RichTextEditorProps {
  value?: string;
  onChange?: (markdown: string) => void;
  output?: "markdown";
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  features?: RichTextEditorFeature[];
}

const DEFAULT_FEATURES: RichTextEditorFeature[] = [
  "bold",
  "italic",
  "underline",
  "link",
  "heading",
  "list",
  "codeBlock",
  "color",
  "fontSize",
];

/**
 * `tiptap-markdown` injects a `markdown` storage slot at runtime but does not
 * augment the Editor's TS types, so we read it through a narrow cast. Matches
 * the helper in `WikiEditor.tsx`.
 */
function getMarkdownFromEditor(ed: Editor): string {
  const storage = ed.storage as unknown as Record<string, unknown>;
  const slot = storage.markdown as { getMarkdown?: () => string } | undefined;
  return slot?.getMarkdown?.() ?? "";
}

export function RichTextEditor({
  value,
  onChange,
  output: _output = "markdown",
  placeholder: _placeholder,
  readOnly = false,
  minHeight = "200px",
  features = DEFAULT_FEATURES,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Replaced by CodeBlockLowlight below.
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-isu-600 underline" },
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Underline,
      // TextStyle base + Color/FontSize는 textStyle mark에 attribute를 얹는 official extensions.
      // markdown 표준이 없어 inline `<span style="...">`로 round-trip (Markdown html:true에 의존).
      TextStyle,
      Color,
      FontSize,
      Markdown.configure({
        html: true,
        linkify: true,
        breaks: false,
        transformPastedText: true,
      }),
    ],
    content: value ?? "",
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // ProseMirror 자체에는 scroll/resize를 두지 않는다 — 외부 wrapper가 담당.
        class: "prose prose-sm max-w-none px-4 py-3 focus:outline-none dark:prose-invert",
        "data-testid": "rich-text-editor",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!onChange) return;
      onChange(getMarkdownFromEditor(ed));
    },
  });

  // Keep the editable flag in sync if `readOnly` toggles after mount.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) {
    return (
      <div
        className="rounded-lg border border-surface-200 bg-card p-6 text-sm text-surface-400"
        style={{ minHeight }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-(--line) bg-card">
      <Toolbar editor={editor} features={features} readOnly={readOnly} />
      {/* Body wrapper:
       *  - min-height: prop으로 받은 값 (기본 200px)
       *  - max-height: clamp(360px, 60vh, 720px) — 너무 길어지면 스크롤
       *  - resize: vertical — 우측 하단 핸들로 사용자가 늘릴 수 있음
       *  - overflow-y: auto — max-height 넘으면 자동 스크롤
       *  Note: resize/overflow는 ProseMirror가 아닌 외부 wrapper에 둬야 cursor 추적 정상.
       */}
      <div
        className="overflow-y-auto"
        style={{
          minHeight,
          maxHeight: "clamp(360px, 60vh, 720px)",
          resize: "vertical",
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default RichTextEditor;
