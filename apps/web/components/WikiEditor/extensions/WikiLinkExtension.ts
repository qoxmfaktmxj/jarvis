/**
 * WikiLinkExtension
 * ----------------------------------------------------------------------------
 * Tiptap Mark for wiki-style `[[pageName]]` or `[[pageName|displayText]]`
 * links. Emits a `showWikiLinkSuggest` CustomEvent when the user types `[[`
 * so the parent <WikiEditor /> can render an autocomplete dropdown.
 *
 * NOTE: This extension is intended for `wiki/manual/**` pages only.
 *       The `wiki/auto/**` tree is managed by the LLM ingestion pipeline.
 */
import {
  Mark,
  mergeAttributes,
  markInputRule,
  type CommandProps,
  type RawCommands,
} from "@tiptap/react";

export interface WikiLinkOptions {
  /**
   * Workspace ID used to build the resolved href:
   *   `/wiki/{workspaceId}/{href}`.
   */
  workspaceId: string;
  /** Extra classes appended to the rendered <a>. */
  HTMLAttributes: Record<string, unknown>;
}

// NOTE: We intentionally skip a `declare module "@tiptap/core"` Commands
// augmentation here because tiptap's core module is only reachable transitively
// through `@tiptap/react`. Callers that need the typed `setWikiLink` command
// should cast through the editor's `chain()` API.

/** Matches `[[pageName]]` or `[[pageName|display text]]` at end of typing. */
const wikiLinkInputRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;

export const WikiLinkExtension = Mark.create<WikiLinkOptions>({
  name: "wikiLink",

  addOptions() {
    return {
      workspaceId: "",
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-wikilink-href"),
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.href) return {};
          return { "data-wikilink-href": attrs.href };
        },
      },
      label: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-wikilink-label"),
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.label) return {};
          return { "data-wikilink-label": attrs.label };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wikilink="true"]',
      },
    ];
  },

  renderHTML({
    HTMLAttributes,
    mark,
  }: {
    HTMLAttributes: Record<string, unknown>;
    mark: { attrs: Record<string, unknown> };
  }) {
    const href = (mark.attrs.href as string | null) ?? "";
    const workspaceId = this.options.workspaceId || "_";
    const resolvedHref = href ? `/wiki/${workspaceId}/${href}` : "#";
    return [
      "a",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-wikilink": "true",
        href: resolvedHref,
        class: "wiki-link",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setWikiLink:
        (attrs: { href: string; label?: string | null }) =>
        ({ commands }: CommandProps) => {
          return commands.setMark(this.name, attrs);
        },
      unsetWikiLink:
        () =>
        ({ commands }: CommandProps) => {
          return commands.unsetMark(this.name);
        },
    } as Partial<RawCommands>;
  },

  addInputRules() {
    return [
      markInputRule({
        find: wikiLinkInputRegex,
        type: this.type,
        getAttributes: (match: RegExpMatchArray) => {
          const [, page, label] = match;
          return {
            href: (page ?? "").trim(),
            label: label ? label.trim() : null,
          };
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // When the user types the second `[`, surface an autocomplete request.
      // The actual dropdown lives in <WikiEditor />; this is just a stub
      // so the editor stays decoupled from any specific UI library.
      "[": () => {
        if (typeof window === "undefined") return false;
        const detail = { query: "", source: "wikiLinkExtension" } as const;
        window.dispatchEvent(
          new CustomEvent("showWikiLinkSuggest", { detail }),
        );
        // Returning false lets the bracket character still be inserted.
        return false;
      },
    };
  },
});

export default WikiLinkExtension;
