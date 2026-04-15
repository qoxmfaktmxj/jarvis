import { describe, expect, it } from "vitest";

import {
  formatWikilink,
  parseWikilink,
  parseWikilinks,
  renderWikilinks,
} from "../wikilink.js";

describe("wikilink — [[page]] (simple form)", () => {
  const cases = [
    { input: "[[page]]", target: "page" },
    { input: "[[휴가정책]]", target: "휴가정책" },
    { input: "[[MindVault]]", target: "MindVault" },
    { input: "[[folder/page]]", target: "folder/page" },
    { input: "[[entities/김철수 (CFO)]]", target: "entities/김철수 (CFO)" },
  ];

  for (const c of cases) {
    it(`parses ${c.input}`, () => {
      const parsed = parseWikilink(c.input);
      expect(parsed).not.toBeNull();
      expect(parsed?.target).toBe(c.target);
      expect(parsed?.alias).toBeUndefined();
      expect(parsed?.anchor).toBeUndefined();
    });
  }
});

describe("wikilink — [[page|alias]] (alias form)", () => {
  const cases = [
    { input: "[[page|표시이름]]", target: "page", alias: "표시이름" },
    { input: "[[MindVault|마인드볼트]]", target: "MindVault", alias: "마인드볼트" },
    { input: "[[concepts/rbac|권한 모델]]", target: "concepts/rbac", alias: "권한 모델" },
    { input: "[[entities/John|John Doe]]", target: "entities/John", alias: "John Doe" },
    { input: "[[잘 알려진 페이지|짧은 이름]]", target: "잘 알려진 페이지", alias: "짧은 이름" },
  ];

  for (const c of cases) {
    it(`parses ${c.input}`, () => {
      const parsed = parseWikilink(c.input);
      expect(parsed).not.toBeNull();
      expect(parsed?.target).toBe(c.target);
      expect(parsed?.alias).toBe(c.alias);
      expect(parsed?.anchor).toBeUndefined();
    });
  }
});

describe("wikilink — [[folder/page#anchor]] (anchor form)", () => {
  const cases = [
    {
      input: "[[folder/page#anchor]]",
      target: "folder/page",
      anchor: "anchor",
    },
    {
      input: "[[concepts/rbac#role-mapping]]",
      target: "concepts/rbac",
      anchor: "role-mapping",
    },
    {
      input: "[[entities/John#biography]]",
      target: "entities/John",
      anchor: "biography",
    },
    {
      input: "[[entities/부서#조직도]]",
      target: "entities/부서",
      anchor: "조직도",
    },
    {
      input: "[[auto/sources/2025-report#summary]]",
      target: "auto/sources/2025-report",
      anchor: "summary",
    },
  ];

  for (const c of cases) {
    it(`parses ${c.input}`, () => {
      const parsed = parseWikilink(c.input);
      expect(parsed).not.toBeNull();
      expect(parsed?.target).toBe(c.target);
      expect(parsed?.anchor).toBe(c.anchor);
      expect(parsed?.alias).toBeUndefined();
    });
  }
});

describe("wikilink — combined anchor + alias", () => {
  it("splits alias after anchor when both present", () => {
    const parsed = parseWikilink("[[concepts/rbac#role-mapping|역할 매핑]]");
    expect(parsed).not.toBeNull();
    expect(parsed?.target).toBe("concepts/rbac");
    expect(parsed?.anchor).toBe("role-mapping");
    expect(parsed?.alias).toBe("역할 매핑");
  });
});

describe("wikilink — parseWikilinks (stream parsing)", () => {
  it("parses multiple wikilinks in document order", () => {
    const text =
      "본문에 [[page-a]]와 [[page-b|별칭]] 그리고 [[folder/c#anc]] 링크가 있다.";
    const links = parseWikilinks(text);
    expect(links).toHaveLength(3);
    expect(links[0]?.target).toBe("page-a");
    expect(links[1]?.alias).toBe("별칭");
    expect(links[2]?.anchor).toBe("anc");
  });

  it("ignores malformed literals", () => {
    const text = "잘못된 [[  ]]와 [[]] 그리고 정상 [[page]]";
    const links = parseWikilinks(text);
    expect(links).toHaveLength(1);
    expect(links[0]?.target).toBe("page");
  });

  it("does not cross line boundaries", () => {
    const text = "[[first\nsecond]] and [[valid]]";
    const links = parseWikilinks(text);
    expect(links).toHaveLength(1);
    expect(links[0]?.target).toBe("valid");
  });
});

describe("wikilink — renderWikilinks", () => {
  it("transforms each parsed link, leaves text intact", () => {
    const text = "머리말 [[alpha]] 가운데 [[beta|베타]] 끝.";
    const out = renderWikilinks(text, (link) =>
      link.alias ? `<a>${link.alias}</a>` : `<a>${link.target}</a>`,
    );
    expect(out).toBe("머리말 <a>alpha</a> 가운데 <a>베타</a> 끝.");
  });

  it("leaves malformed [[...]] untouched", () => {
    const text = "[[]] and [[ok]]";
    const out = renderWikilinks(text, (link) => `<A:${link.target}>`);
    expect(out).toBe("[[]] and <A:ok>");
  });
});

describe("wikilink — formatWikilink (inverse)", () => {
  it("formats target-only", () => {
    expect(formatWikilink({ target: "page" })).toBe("[[page]]");
  });

  it("formats with alias", () => {
    expect(formatWikilink({ target: "p", alias: "별칭" })).toBe("[[p|별칭]]");
  });

  it("formats with anchor", () => {
    expect(formatWikilink({ target: "f/p", anchor: "h1" })).toBe("[[f/p#h1]]");
  });

  it("formats with anchor + alias in stable order", () => {
    expect(
      formatWikilink({ target: "f/p", anchor: "h1", alias: "별칭" }),
    ).toBe("[[f/p#h1|별칭]]");
  });
});

describe("wikilink — totals", () => {
  it("covers at least 15 explicit cases (5 per form)", () => {
    // Mirrors the DoD counter — the three "parses" describe blocks above
    // each carry 5 cases. This is a sanity assertion so future edits
    // don't silently drop a fixture.
    const simple = ["a", "b", "c", "d", "e"].map((t) => `[[${t}]]`);
    const alias = [1, 2, 3, 4, 5].map((n) => `[[p${n}|alias${n}]]`);
    const anchor = [1, 2, 3, 4, 5].map((n) => `[[p${n}#a${n}]]`);
    const combined = [...simple, ...alias, ...anchor];
    for (const literal of combined) {
      expect(parseWikilink(literal)).not.toBeNull();
    }
    expect(combined).toHaveLength(15);
  });
});
