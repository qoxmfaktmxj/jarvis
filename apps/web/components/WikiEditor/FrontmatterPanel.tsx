"use client";

/**
 * FrontmatterPanel
 * ----------------------------------------------------------------------------
 * Edits the YAML frontmatter portion of a `wiki/manual/**` markdown page.
 * Known keys (title / tags) get dedicated inputs; every other key falls into
 * a free-form raw textarea so power users can keep custom fields intact.
 *
 * sensitivity 격리는 RBAC + workspaceId 모델로 일원화되었다 (2026-05-11 step 2A) —
 * 본 패널에서 sensitivity 입력 제거.
 */
import { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface Frontmatter {
  title: string;
  tags?: string[];
  [key: string]: unknown;
}

interface FrontmatterPanelProps {
  frontmatter: Frontmatter;
  onChange: (next: Frontmatter) => void;
  readOnly?: boolean;
}

const KNOWN_KEYS = new Set(["title", "tags"]);

function serializeRawExtras(fm: Frontmatter): string {
  const extras = Object.entries(fm).filter(([k]) => !KNOWN_KEYS.has(k));
  if (extras.length === 0) return "";
  return extras
    .map(([k, v]) => {
      if (v === null || v === undefined) return `${k}:`;
      if (typeof v === "string") return `${k}: ${v}`;
      try {
        return `${k}: ${JSON.stringify(v)}`;
      } catch {
        return `${k}:`;
      }
    })
    .join("\n");
}

function parseRawExtras(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sepIdx = trimmed.indexOf(":");
    if (sepIdx === -1) continue;
    const key = trimmed.slice(0, sepIdx).trim();
    const value = trimmed.slice(sepIdx + 1).trim();
    if (!key) continue;
    if (!value) {
      out[key] = "";
      continue;
    }
    try {
      out[key] = JSON.parse(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function FrontmatterPanel({
  frontmatter,
  onChange,
  readOnly = false,
}: FrontmatterPanelProps) {
  const t = useTranslations("WikiEditor.frontmatter");

  const initialRawExtras = useMemo(
    () => serializeRawExtras(frontmatter),
    // Intentionally only seeded once — local edits should not be clobbered
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [rawExtras, setRawExtras] = useState(initialRawExtras);
  const [tagsInput, setTagsInput] = useState((frontmatter.tags ?? []).join(", "));

  // Keep the tag string in sync if the parent overwrites the frontmatter wholesale.
  useEffect(() => {
    setTagsInput((frontmatter.tags ?? []).join(", "));
  }, [frontmatter.tags]);

  const emit = useCallback(
    (patch: Partial<Frontmatter>, extrasOverride?: string) => {
      const extras = parseRawExtras(extrasOverride ?? rawExtras);
      // Preserve known fields, then layer extras, then layer the explicit patch
      // so deliberate updates always win.
      const next: Frontmatter = {
        ...extras,
        title: frontmatter.title,
        tags: frontmatter.tags,
        ...patch,
      };
      onChange(next);
    },
    [frontmatter.tags, frontmatter.title, onChange, rawExtras],
  );

  const handleTitleChange = (value: string) => {
    emit({ title: value });
  };

  const handleTagsBlur = () => {
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    emit({ tags });
  };

  const handleRawChange = (value: string) => {
    setRawExtras(value);
    emit({}, value);
  };

  return (
    <section
      className="rounded-lg border border-(--border-default) bg-(--bg-surface) p-4 space-y-4"
      data-testid="wiki-frontmatter-panel"
    >
      <div className="space-y-1.5">
        <Label htmlFor="wiki-fm-title">{t("title")}</Label>
        <Input
          id="wiki-fm-title"
          value={frontmatter.title ?? ""}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wiki-fm-tags">{t("tags")}</Label>
        <Input
          id="wiki-fm-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onBlur={handleTagsBlur}
          placeholder="tag1, tag2"
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wiki-fm-raw">YAML</Label>
        <Textarea
          id="wiki-fm-raw"
          value={rawExtras}
          onChange={(e) => handleRawChange(e.target.value)}
          rows={4}
          className="font-mono text-xs"
          placeholder="custom_key: value"
          disabled={readOnly}
        />
      </div>
    </section>
  );
}

export default FrontmatterPanel;
