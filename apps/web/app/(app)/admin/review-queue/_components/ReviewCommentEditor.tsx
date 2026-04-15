"use client";

import { RichTextEditor } from "@/components/RichTextEditor";

interface ReviewCommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function ReviewCommentEditor({
  value,
  onChange,
  placeholder,
  readOnly,
}: ReviewCommentEditorProps) {
  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      features={["bold", "italic", "link", "list"]}
      output="markdown"
      minHeight="150px"
      placeholder={placeholder}
      readOnly={readOnly}
    />
  );
}
