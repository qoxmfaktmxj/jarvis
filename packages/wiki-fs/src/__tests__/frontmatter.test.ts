import { describe, expect, it } from "vitest";

import {
  defaultFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
  splitFrontmatter,
} from "../frontmatter.js";
import type { WikiFrontmatter } from "../types.js";

/**
 * Round-trip fixtures — 20+ entries covering Korean titles, mixed-language
 * aliases, linkedPages, quotes, tags, sources, and sensitivity levels.
 *
 * Each fixture is asserted twice:
 *   1. parse(serialize(data, body)).data preserves all known fields.
 *   2. parse(serialize(data, body)).body equals the original body.
 */
interface Fixture {
  name: string;
  data: Partial<WikiFrontmatter> & { [key: string]: unknown };
  body: string;
}

const fixtures: Fixture[] = [
  {
    name: "korean title with aliases",
    data: {
      title: "휴가 정책",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      aliases: ["휴가정책", "vacation policy", "연차 규정"],
      linkedPages: ["entities/HR", "concepts/근무-시간"],
      tags: ["domain/hr", "type/policy"],
    },
    body: "# 휴가 정책\n\n본문 내용입니다.\n",
  },
  {
    name: "english title with korean aliases",
    data: {
      title: "MindVault",
      type: "entity",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      aliases: ["마인드볼트", "mind vault", "MV"],
      linkedPages: ["concepts/failure-mode"],
    },
    body: "# MindVault\n\nDeprecated 2026-04-14.\n",
  },
  {
    name: "title containing double quotes",
    data: {
      title: '그는 "안녕"이라고 말했다',
      type: "source",
      workspaceId: "ws-2",
      sensitivity: "RESTRICTED",
    },
    body: "quote-containing source page\n",
  },
  {
    name: "title with colon and backticks",
    data: {
      title: "Jarvis: `packages/wiki-fs` 소개",
      type: "synthesis",
      workspaceId: "ws-1",
      sensitivity: "PUBLIC",
      linkedPages: ["concepts/wiki-fs", "entities/Jarvis"],
    },
    body: "synthesis body\n",
  },
  {
    name: "secret ref only page with empty body",
    data: {
      title: "재무 비밀 참조",
      type: "concept",
      workspaceId: "ws-3",
      sensitivity: "SECRET_REF_ONLY",
      requiredPermission: "finance:read_secret_ref",
    },
    body: "",
  },
  {
    name: "derived code page with many linked pages",
    data: {
      title: "graphify.ts",
      type: "derived",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      linkedPages: Array.from({ length: 8 }, (_, i) => `entities/Module${i}`),
    },
    body: "auto/derived/code/graphify.ts summary\n",
  },
  {
    name: "sources array with multiple ids",
    data: {
      title: "2025 정책 변경안",
      type: "source",
      workspaceId: "ws-2",
      sensitivity: "INTERNAL",
      sources: ["raw_2025-01", "raw_2025-02", "raw_2025-03"],
    },
    body: "소스 페이지\n",
  },
  {
    name: "empty arrays preserved",
    data: {
      title: "고아 페이지",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "PUBLIC",
      aliases: [],
      linkedPages: [],
      tags: [],
      sources: [],
    },
    body: "일부러 비어있는 배열.\n",
  },
  {
    name: "authority manual",
    data: {
      title: "법무 오버라이드",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "RESTRICTED",
      authority: "manual",
    },
    body: "법무팀이 수동 편집\n",
  },
  {
    name: "long korean body",
    data: {
      title: "장문 페이지",
      type: "synthesis",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
    },
    body: "## 섹션1\n\n내용이\n여러 줄.\n\n## 섹션2\n\n- 목록1\n- 목록2\n",
  },
  {
    name: "aliases with hyphens and spaces",
    data: {
      title: "Next.js 15 App Router",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "PUBLIC",
      aliases: ["app router", "next15", "넥스트 15"],
    },
    body: "# Next.js\n",
  },
  {
    name: "tags hierarchical",
    data: {
      title: "권한 정책",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      tags: ["domain/security", "type/policy", "status/active"],
    },
    body: "RBAC policy\n",
  },
  {
    name: "created updated different dates",
    data: {
      title: "역사적 페이지",
      type: "entity",
      workspaceId: "ws-1",
      sensitivity: "PUBLIC",
      created: "2024-01-01T00:00:00Z",
      updated: "2026-04-15T12:30:00Z",
    },
    body: "\n",
  },
  {
    name: "linkedPages with anchors",
    data: {
      title: "앵커 포함 링크",
      type: "synthesis",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      linkedPages: ["concepts/rbac", "entities/John#biography"],
    },
    body: "link test\n",
  },
  {
    name: "required permission custom",
    data: {
      title: "재무 보고서",
      type: "concept",
      workspaceId: "ws-3",
      sensitivity: "RESTRICTED",
      requiredPermission: "finance:report_read",
    },
    body: "재무 \n",
  },
  {
    name: "workspaceId uuid",
    data: {
      title: "UUID 워크스페이스",
      type: "concept",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      sensitivity: "INTERNAL",
    },
    body: "uuid page\n",
  },
  {
    name: "single-quote containing title",
    data: {
      title: "오늘의 'TIL'",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "PUBLIC",
    },
    body: "TIL body\n",
  },
  {
    name: "unknown extra field preserved",
    data: {
      title: "확장 필드",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      customField: "passthrough-value",
      nestedField: { inner: "x" },
    },
    body: "extra fields passthrough\n",
  },
  {
    name: "emoji in body and aliases",
    data: {
      title: "이모지 테스트",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "PUBLIC",
      aliases: ["🚀 로켓", "emoji test"],
    },
    body: "이모지 ✅ 본문\n",
  },
  {
    name: "source page with five sources",
    data: {
      title: "다중 원본 요약",
      type: "source",
      workspaceId: "ws-2",
      sensitivity: "INTERNAL",
      sources: ["s1", "s2", "s3", "s4", "s5"],
      linkedPages: ["entities/Org", "concepts/Procedure"],
    },
    body: "multi-source summary\n",
  },
  {
    name: "korean entity page with long linkedPages",
    data: {
      title: "김철수 (CFO)",
      type: "entity",
      workspaceId: "ws-1",
      sensitivity: "RESTRICTED",
      aliases: ["Cheolsu Kim", "K.C.S.", "김CFO"],
      linkedPages: [
        "entities/재무팀",
        "concepts/연간예산",
        "syntheses/2026-Q1-브리핑",
      ],
    },
    body: "# 김철수\n\n재무 담당 최고책임자.\n",
  },
];

describe("frontmatter round-trip", () => {
  // Sanity — fixture count must meet the DoD (≥ 20).
  it("has at least 20 round-trip fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  for (const fx of fixtures) {
    it(`round-trips: ${fx.name}`, () => {
      const serialized = serializeFrontmatter(fx.data, fx.body);
      expect(serialized.startsWith("---\n")).toBe(true);

      const { data, body } = parseFrontmatter(serialized);

      // Body must round-trip byte-for-byte.
      expect(body).toBe(fx.body);

      // Compare known fields that the fixture set. Fields the fixture
      // omits fall back to defaults; we only assert the caller's inputs.
      for (const key of Object.keys(fx.data) as Array<keyof typeof fx.data>) {
        expect(data[key as keyof WikiFrontmatter]).toEqual(fx.data[key]);
      }
    });
  }
});

describe("frontmatter — korean YAML escape safety", () => {
  it("handles strings containing double quotes without data loss", () => {
    const data: Partial<WikiFrontmatter> = {
      title: '따옴표 "포함" 문자열',
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
      aliases: ['"인용부호"', '따옴표 "포함"'],
    };
    const serialized = serializeFrontmatter(data, "body\n");
    const parsed = parseFrontmatter(serialized).data;
    expect(parsed.title).toBe('따옴표 "포함" 문자열');
    expect(parsed.aliases).toEqual(['"인용부호"', '따옴표 "포함"']);
  });

  it("handles strings containing single quotes", () => {
    const data: Partial<WikiFrontmatter> = {
      title: "오늘의 'TIL'",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
    };
    const serialized = serializeFrontmatter(data, "");
    const parsed = parseFrontmatter(serialized).data;
    expect(parsed.title).toBe("오늘의 'TIL'");
  });

  it("handles colon-containing strings (YAML plain-scalar hazard)", () => {
    const data: Partial<WikiFrontmatter> = {
      title: "Jarvis: 새 프로젝트",
      type: "concept",
      workspaceId: "ws-1",
      sensitivity: "INTERNAL",
    };
    const serialized = serializeFrontmatter(data, "");
    const parsed = parseFrontmatter(serialized).data;
    expect(parsed.title).toBe("Jarvis: 새 프로젝트");
  });
});

describe("frontmatter — validation", () => {
  it("throws on invalid `type`", () => {
    const source = [
      "---",
      "title: 잘못된 페이지",
      "type: bogus",
      "workspaceId: ws-1",
      "sensitivity: INTERNAL",
      "---",
      "body",
    ].join("\n");
    expect(() => parseFrontmatter(source)).toThrow(/Invalid frontmatter\.type/);
  });

  it("throws on invalid `sensitivity`", () => {
    const source = [
      "---",
      "title: ok",
      "type: concept",
      "workspaceId: ws-1",
      "sensitivity: MAYBE",
      "---",
      "",
    ].join("\n");
    expect(() => parseFrontmatter(source)).toThrow(/Invalid frontmatter\.sensitivity/);
  });

  it("returns defaults for empty doc without frontmatter", () => {
    const parsed = parseFrontmatter("# no frontmatter\n");
    expect(parsed.data.title).toBe("");
    expect(parsed.body).toBe("# no frontmatter\n");
  });
});

describe("splitFrontmatter", () => {
  it("returns null frontmatter for body-only document", () => {
    const split = splitFrontmatter("hello world");
    expect(split.frontmatter).toBeNull();
    expect(split.body).toBe("hello world");
  });

  it("accepts CRLF line endings", () => {
    const source = `---\r\ntitle: x\r\ntype: concept\r\n---\r\nbody`;
    const split = splitFrontmatter(source);
    expect(split.frontmatter).toContain("title: x");
    expect(split.body).toBe("body");
  });
});

describe("defaultFrontmatter", () => {
  it("returns schema-safe defaults", () => {
    const d = defaultFrontmatter();
    expect(d.type).toBe("concept");
    expect(d.sensitivity).toBe("INTERNAL");
    expect(d.authority).toBe("auto");
    expect(d.aliases).toEqual([]);
    expect(d.linkedPages).toEqual([]);
  });
});
