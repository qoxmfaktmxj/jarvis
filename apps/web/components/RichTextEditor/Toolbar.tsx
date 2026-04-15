"use client";

/**
 * Toolbar — shared formatting toolbar for Tiptap-based editors.
 * ----------------------------------------------------------------------------
 * Extracted from `WikiEditor.tsx` so both `<RichTextEditor />` (generic usage
 * across apps/web) and `<WikiEditor />` (wiki-specific surface) can share one
 * button implementation. Buttons are rendered only when their corresponding
 * feature key is present in `features`.
 *
 * i18n keys are read from `WikiEditor.toolbar` namespace to avoid duplicating
 * translations until a more generic namespace is introduced.
 */
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type ToolbarFeature =
  | "bold"
  | "italic"
  | "link"
  | "heading"
  | "list"
  | "codeBlock";

interface ToolbarProps {
  editor: Editor | null;
  features: ToolbarFeature[];
  readOnly?: boolean;
}

export function Toolbar({ editor, features, readOnly = false }: ToolbarProps) {
  const t = useTranslations("WikiEditor.toolbar");

  if (!editor || readOnly) return null;

  const has = (f: ToolbarFeature) => features.includes(f);

  const ToolbarButton = ({
    onClick,
    active,
    label,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    label: string;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );

  const promptForLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("link"), previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  // Track whether we've rendered a separator group already so separators only
  // appear between non-empty groups.
  const inlineGroup = has("bold") || has("italic") || has("link") || has("codeBlock");
  const headingGroup = has("heading");
  const listGroup = has("list");

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-1.5"
      role="toolbar"
    >
      {has("bold") && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          label={t("bold")}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
      )}
      {has("italic") && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          label={t("italic")}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
      )}
      {has("link") && (
        <ToolbarButton
          onClick={promptForLink}
          active={editor.isActive("link")}
          label={t("link")}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
      )}
      {has("codeBlock") && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          label={t("codeBlock")}
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
      )}

      {inlineGroup && headingGroup && <span className="mx-1 h-5 w-px bg-gray-200" />}

      {has("heading") && (
        <>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })}
            label={`${t("heading")} 1`}
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            label={`${t("heading")} 2`}
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })}
            label={`${t("heading")} 3`}
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
        </>
      )}

      {(inlineGroup || headingGroup) && listGroup && (
        <span className="mx-1 h-5 w-px bg-gray-200" />
      )}

      {has("list") && (
        <>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            label={t("bulletList")}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            label={t("orderedList")}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

export default Toolbar;
