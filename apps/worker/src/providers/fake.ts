import type { ProviderAdapter, ProviderPayload } from "./types.js";

const EXTERNAL_ID = "synthetic-annual-leave-guide-001";
const rawSourceText = [
  "# 합성 연차휴가 안내   ",
  "",
  "이 문서는 공개 데모와 테스트를 위한 합성 자료입니다.   ",
  "실제 법률 자문이나 특정 기관의 공식 문서가 아닙니다.   ",
  "",
].join("\r\n");

export const fakeProvider: ProviderAdapter = {
  id: "synthetic-hr",
  canonicalHostnames: new Set(["example.invalid"]),
  async list(cursor) {
    if (cursor === "done") return { items: [] };
    if (cursor !== undefined) throw new Error("invalid synthetic cursor");
    return {
      items: [{ externalId: EXTERNAL_ID, title: "합성 연차휴가 안내" }],
      nextCursor: "done",
    };
  },
  async fetch(externalId): Promise<ProviderPayload> {
    if (externalId !== EXTERNAL_ID) throw new Error(`synthetic source not found: ${externalId}`);
    return {
      document: {
        provider: "synthetic-hr",
        externalId,
        sourceType: "guide",
        title: "합성 연차휴가 안내",
        canonicalUrl: "https://example.invalid/synthetic-annual-leave-guide-001",
        metadata: { synthetic: true },
      },
      revision: {
        revisionKey: "v1",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
        rawBytes: new TextEncoder().encode(rawSourceText),
        contentType: "text/plain",
        normalizedText: rawSourceText,
        metadata: { synthetic: true, language: "ko" },
      },
    };
  },
};
