"use client";

/**
 * Toolbar — shared formatting toolbar for Tiptap-based editors.
 * ----------------------------------------------------------------------------
 * Notion-refined design (2026-04-30 redesign):
 *  - Sticky toolbar (parent에서 sticky 배경 처리)
 *  - 색상은 split button: swatch 클릭 = 즉시 적용(기억된 마지막 색),
 *    chevron 클릭 = popover (preset grid + native color picker + reset)
 *  - lastUsedColor는 localStorage `jv.editor.lastColor`에 저장 (기본 검정)
 *  - 인라인 mark / heading / list는 segment 패턴 (붙어있는 그룹)
 *  - 글자 크기는 native select 유지 (a11y) + appearance:none 커스텀 스타일
 *
 * 공유 대상: <RichTextEditor /> (notices/manual/review-queue) + <WikiEditor />.
 * features prop으로 노출 제어. i18n은 WikiEditor.toolbar 네임스페이스.
 */
import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ToolbarFeature =
  | "bold"
  | "italic"
  | "underline"
  | "link"
  | "heading"
  | "list"
  | "codeBlock"
  | "color"
  | "fontSize";

const FONT_SIZE_OPTIONS = ["12", "14", "16", "18", "20", "24", "30", "36"] as const;

// Notion-aligned 11색 팔레트. 흰색은 배경과 구분 불가라 제외(reset으로 충분).
const COLOR_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#0a0a0a", label: "검정" },
  { value: "#615d59", label: "회색" },
  { value: "#523410", label: "갈색" },
  { value: "#dd5b00", label: "주황" },
  { value: "#dc2626", label: "빨강" },
  { value: "#ff64c8", label: "분홍" },
  { value: "#391c57", label: "보라" },
  { value: "#0075de", label: "파랑" },
  { value: "#2a9d99", label: "청록" },
  { value: "#1aae39", label: "초록" },
  { value: "#eab308", label: "노랑" },
];

const DEFAULT_COLOR = "#0a0a0a";
const LAST_COLOR_KEY = "jv.editor.lastColor";

function readLastColor(): string {
  if (typeof window === "undefined") return DEFAULT_COLOR;
  try {
    const v = window.localStorage.getItem(LAST_COLOR_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
}

function persistLastColor(c: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_COLOR_KEY, c);
  } catch {
    /* ignore */
  }
}

interface ToolbarProps {
  editor: Editor | null;
  features: ToolbarFeature[];
  readOnly?: boolean;
}

// ── Internal building blocks ──────────────────────────────────────────────

function Segment({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center rounded-md border border-(--line) bg-transparent">
      {children}
    </div>
  );
}

function SegBtn({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  // first:rounded-l-md / last:rounded-r-md — Segment 안의 첫/끝 버튼 코너만 둥글게.
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      className={[
        "inline-flex h-7 w-7 items-center justify-center transition-colors",
        "first:rounded-l-md last:rounded-r-md",
        active
          ? "bg-(--line2) text-(--ink)"
          : "text-(--ink2) hover:bg-(--line2) hover:text-(--ink)",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-(--line)" />;
}

// ── Main component ────────────────────────────────────────────────────────

export function Toolbar({ editor, features, readOnly = false }: ToolbarProps) {
  const t = useTranslations("WikiEditor.toolbar");
  const [lastColor, setLastColor] = useState<string>(DEFAULT_COLOR);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    setLastColor(readLastColor());
  }, []);

  const applyColor = useCallback(
    (c: string) => {
      if (!editor) return;
      editor.chain().focus().setColor(c).run();
      setLastColor(c);
      persistLastColor(c);
    },
    [editor],
  );

  if (!editor || readOnly) return null;

  const has = (f: ToolbarFeature) => features.includes(f);

  const promptForLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("link"), previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const inlineGroup =
    has("bold") || has("italic") || has("underline") || has("link") || has("codeBlock");
  const headingGroup = has("heading");
  const listGroup = has("list");
  const styleGroup = has("color") || has("fontSize");

  const currentColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? "";
  const currentFontSize =
    (editor.getAttributes("textStyle").fontSize as string | undefined)?.replace(
      "px",
      "",
    ) ?? "";

  // 인라인 mark 버튼들 — 같은 segment 안에 들어감
  const inlineButtons: React.ReactNode[] = [];
  if (has("bold"))
    inlineButtons.push(
      <SegBtn
        key="b"
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label={t("bold")}
      >
        <Bold className="h-3.5 w-3.5" strokeWidth={2.25} />
      </SegBtn>,
    );
  if (has("italic"))
    inlineButtons.push(
      <SegBtn
        key="i"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label={t("italic")}
      >
        <Italic className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
    );
  if (has("underline"))
    inlineButtons.push(
      <SegBtn
        key="u"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        label={t("underline")}
      >
        <UnderlineIcon className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
    );
  if (has("link"))
    inlineButtons.push(
      <SegBtn
        key="l"
        onClick={promptForLink}
        active={editor.isActive("link")}
        label={t("link")}
      >
        <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
    );
  if (has("codeBlock"))
    inlineButtons.push(
      <SegBtn
        key="c"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        label={t("codeBlock")}
      >
        <Code2 className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
    );

  const headingButtons: React.ReactNode[] = [];
  if (has("heading")) {
    headingButtons.push(
      <SegBtn
        key="h1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        label={`${t("heading")} 1`}
      >
        <Heading1 className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
      <SegBtn
        key="h2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        label={`${t("heading")} 2`}
      >
        <Heading2 className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
      <SegBtn
        key="h3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        label={`${t("heading")} 3`}
      >
        <Heading3 className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
    );
  }

  const listButtons: React.ReactNode[] = [];
  if (has("list")) {
    listButtons.push(
      <SegBtn
        key="ul"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        label={t("bulletList")}
      >
        <List className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
      <SegBtn
        key="ol"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label={t("orderedList")}
      >
        <ListOrdered className="h-3.5 w-3.5" strokeWidth={2} />
      </SegBtn>,
    );
  }

  // Active swatch 표시 색 — 텍스트에 색이 적용돼있으면 그 색, 없으면 마지막 사용색
  const swatchDisplayColor = currentColor || lastColor;

  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-(--line) bg-(--bg-page)/85 px-2 py-1.5 backdrop-blur-md"
      role="toolbar"
    >
      {/* Inline marks segment */}
      {inlineGroup && <Segment>{inlineButtons}</Segment>}

      {/* Heading segment */}
      {headingGroup && (
        <>
          {inlineGroup && <Divider />}
          <Segment>{headingButtons}</Segment>
        </>
      )}

      {/* List segment */}
      {listGroup && (
        <>
          {(inlineGroup || headingGroup) && <Divider />}
          <Segment>{listButtons}</Segment>
        </>
      )}

      {/* Style group: font size + color split */}
      {styleGroup && (
        <>
          {(inlineGroup || headingGroup || listGroup) && <Divider />}

          {has("fontSize") && (
            <div className="relative inline-flex">
              <select
                value={currentFontSize}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    editor.chain().focus().unsetFontSize().run();
                  } else {
                    editor.chain().focus().setFontSize(`${v}px`).run();
                  }
                }}
                title={t("fontSize")}
                aria-label={t("fontSize")}
                className="h-7 appearance-none rounded-md border border-(--line) bg-transparent py-0 pr-6 pl-2 text-[11.5px] text-(--ink2) hover:bg-(--line2) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
              >
                <option value="">{t("fontSizeReset")}</option>
                {FONT_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 text-(--muted)"
              />
            </div>
          )}

          {has("color") && (
            <Popover open={colorOpen} onOpenChange={setColorOpen}>
              <div className="inline-flex items-center rounded-md border border-(--line)">
                {/* Swatch 부분 — 즉시 적용 */}
                <button
                  type="button"
                  onClick={() => applyColor(lastColor)}
                  title={`${t("color")}: ${lastColor}`}
                  aria-label={`${t("color")} (${lastColor})`}
                  className="group inline-flex h-7 w-9 items-center justify-center rounded-l-md transition-colors hover:bg-(--line2)"
                >
                  <span
                    aria-hidden
                    className="flex h-[18px] w-[18px] flex-col items-center justify-center rounded-[4px] text-[10px] font-bold leading-none text-(--ink) shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                    style={{
                      background:
                        currentColor && currentColor !== lastColor
                          ? "transparent"
                          : "var(--bg-page)",
                    }}
                  >
                    A
                    <span
                      aria-hidden
                      className="mt-[1px] h-[3px] w-3 rounded-[1px]"
                      style={{ background: swatchDisplayColor }}
                    />
                  </span>
                </button>

                {/* Chevron 부분 — popover 토글 */}
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={`${t("color")} ${t("colorReset")}`}
                    aria-label={`${t("color")} 옵션 열기`}
                    aria-expanded={colorOpen}
                    className="inline-flex h-7 w-5 items-center justify-center rounded-r-md border-l border-(--line) text-(--muted) transition-colors hover:bg-(--line2) hover:text-(--ink)"
                  >
                    <ChevronDown className="h-3 w-3" aria-hidden />
                  </button>
                </PopoverTrigger>
              </div>

              <PopoverContent align="end" sideOffset={6} className="w-auto p-3">
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((c) => {
                    const active =
                      currentColor.toLowerCase() === c.value.toLowerCase();
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          applyColor(c.value);
                          setColorOpen(false);
                        }}
                        title={c.label}
                        aria-label={`${t("color")}: ${c.label}`}
                        aria-pressed={active}
                        className="h-7 w-7 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
                        style={{
                          background: c.value,
                          outline: active ? "2px solid var(--accent)" : undefined,
                          outlineOffset: active ? "2px" : undefined,
                        }}
                      />
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-(--line) pt-3">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs text-(--ink2)">
                    <span className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
                      <input
                        type="color"
                        value={currentColor || lastColor}
                        onChange={(e) => applyColor(e.target.value)}
                        aria-label="사용자 지정 색"
                        className="absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-0 bg-transparent p-0"
                      />
                    </span>
                    <span>사용자 지정</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().unsetColor().run();
                      setColorOpen(false);
                    }}
                    className="rounded px-2 py-1 text-xs text-(--muted) transition-colors hover:bg-(--line2) hover:text-(--ink)"
                  >
                    {t("colorReset")}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </>
      )}
    </div>
  );
}

export default Toolbar;
