/**
 * packages/db/guards/__tests__/body-column-guard.test.ts
 *
 * Phase-W1 T4 — G11 guard 단위 테스트.
 *
 * 실행: `pnpm --filter @jarvis/db test` (루트 package.json 스크립트 또는 직접 node --test + tsx).
 *
 * Node 22 내장 `node:test` 러너 사용 — vitest 의존성 추가 없이 실행 가능.
 */

import { after, before, beforeEach, describe, it } from "node:test";
import { strict as strictAssert } from "node:assert";

import {
  BodyColumnReadGuardError,
  assertNotBodyColumn,
  isBodyColumnGuardActive,
  wrapQuery,
} from "../body-column-guard.js";

const ENV_KEY = "FEATURE_WIKI_FS_MODE";
let originalEnv: string | undefined;

before(() => {
  originalEnv = process.env[ENV_KEY];
});

after(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

beforeEach(() => {
  // 기본값을 매 테스트마다 초기화
  delete process.env[ENV_KEY];
});

describe("G11 body-column-guard — FEATURE_WIKI_FS_MODE=true", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = "true";
  });

  it("knowledge_page.mdxContent 읽기 시 throw", () => {
    strictAssert.throws(
      () => assertNotBodyColumn("knowledge_page", ["id", "title", "mdxContent"]),
      (err: unknown) => {
        strictAssert.ok(err instanceof BodyColumnReadGuardError);
        strictAssert.equal((err as BodyColumnReadGuardError).table, "knowledge_page");
        strictAssert.deepEqual(
          [...(err as BodyColumnReadGuardError).violatingColumns],
          ["mdxContent"],
        );
        strictAssert.match((err as Error).message, /G11/);
        strictAssert.match((err as Error).message, /wiki-fs/);
        return true;
      },
    );
  });

  it("snake_case mdx_content / camelCase tableName 모두 잡음", () => {
    strictAssert.throws(
      () => assertNotBodyColumn("knowledgePage", ["mdx_content"]),
      BodyColumnReadGuardError,
    );
  });

  it("wiki_sources.body 읽기 시 throw", () => {
    strictAssert.throws(
      () => assertNotBodyColumn("wiki_sources", ["id", "body"]),
      BodyColumnReadGuardError,
    );
  });

  it("wiki_concepts.body 읽기 시 throw", () => {
    strictAssert.throws(
      () => assertNotBodyColumn("wiki_concepts", ["body", "title"]),
      BodyColumnReadGuardError,
    );
  });

  it("금지 테이블이지만 금지 컬럼 없으면 통과", () => {
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("knowledge_page", ["id", "title", "slug"]),
    );
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("wiki_sources", ["id", "url"]),
    );
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("wiki_concepts", ["id", "name"]),
    );
  });

  it("금지 목록에 없는 테이블은 통과", () => {
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("workspace", ["id", "body"]),
    );
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("raw_source", ["parsed_content"]),
    );
  });

  it("여러 금지 컬럼을 한 번에 감지", () => {
    strictAssert.throws(
      () =>
        assertNotBodyColumn("knowledge_page", [
          "mdxContent",
          "mdx_content",
          "title",
        ]),
      (err: unknown) => {
        strictAssert.ok(err instanceof BodyColumnReadGuardError);
        const hits = [...(err as BodyColumnReadGuardError).violatingColumns];
        strictAssert.ok(hits.includes("mdxContent"));
        strictAssert.ok(hits.includes("mdx_content"));
        return true;
      },
    );
  });

  it("wrapQuery는 위반 시 throw하고 함수 호출을 막는다", () => {
    let called = false;
    strictAssert.throws(
      () =>
        wrapQuery(
          () => {
            called = true;
            return [];
          },
          { table: "knowledge_page", columns: ["mdxContent"] },
        ),
      BodyColumnReadGuardError,
    );
    strictAssert.equal(called, false);
  });

  it("wrapQuery는 정상 조합에선 함수 결과를 그대로 반환", () => {
    const result = wrapQuery(
      () => ({ rows: [{ id: "x" }] }),
      { table: "knowledge_page", columns: ["id", "title"] },
    );
    strictAssert.deepEqual(result, { rows: [{ id: "x" }] });
  });

  it("isBodyColumnGuardActive는 true 반환", () => {
    strictAssert.equal(isBodyColumnGuardActive(), true);
  });
});

describe("G11 body-column-guard — FEATURE_WIKI_FS_MODE off/unset", () => {
  it("unset 상태에선 금지 조합도 모두 통과", () => {
    delete process.env[ENV_KEY];
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("knowledge_page", ["mdxContent"]),
    );
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("wiki_sources", ["body"]),
    );
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("wiki_concepts", ["body"]),
    );
    strictAssert.equal(isBodyColumnGuardActive(), false);
  });

  it("FEATURE_WIKI_FS_MODE=false 면 통과 (문자열 'true'가 아니면 비활성)", () => {
    process.env[ENV_KEY] = "false";
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("knowledge_page", ["mdxContent"]),
    );
    strictAssert.equal(isBodyColumnGuardActive(), false);
  });

  it("FEATURE_WIKI_FS_MODE=1 도 비활성 (명시적 'true' 문자열만 인정)", () => {
    process.env[ENV_KEY] = "1";
    strictAssert.doesNotThrow(() =>
      assertNotBodyColumn("knowledge_page", ["mdxContent"]),
    );
    strictAssert.equal(isBodyColumnGuardActive(), false);
  });

  it("비활성 시 wrapQuery는 금지 조합이어도 함수 결과 반환", () => {
    delete process.env[ENV_KEY];
    const out = wrapQuery(
      () => "legacy-read-ok",
      { table: "knowledge_page", columns: ["mdxContent"] },
    );
    strictAssert.equal(out, "legacy-read-ok");
  });
});
