import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDigestMarkdown,
  chunk,
  normalizeCaseRow,
  validateImportContract,
} from "../import-cases-to-jarvis.ts";

test("chunk splits arrays into stable batch sizes", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunk rejects invalid batch sizes", () => {
  assert.throws(() => chunk([1], 0), /batch size/i);
  assert.throws(() => chunk([1], 2521), /batch size/i);
});

test("normalizeCaseRow preserves Korean text and maps optional values", () => {
  const row = normalizeCaseRow({
    source_key: "tsvd999/rowid/AAABBBCCCDDDEEEFFF",
    original_seq: 7,
    title: "근태 신청 오류",
    symptom: "신청 버튼이 보이지 않습니다.",
    action: "권한을 확인하고 메뉴를 안내했습니다.",
    resolved: true,
    urgency: false,
    work_hours: 1.25,
    requested_at: "2026-04-13T10:11:12+09:00",
    tags: ["근태", "권한"],
  });

  assert.equal(row.sourceKey, "tsvd999/rowid/AAABBBCCCDDDEEEFFF");
  assert.equal(row.originalSeq, 7);
  assert.equal(row.title, "근태 신청 오류");
  assert.equal(row.resolved, true);
  assert.equal(row.urgency, false);
  assert.equal(row.workHours, "1.3");
  assert.equal(row.requestedAt?.toISOString(), "2026-04-13T01:11:12.000Z");
  assert.deepEqual(row.tags, ["근태", "권한"]);
});

test("buildDigestMarkdown includes representative symptom and action", () => {
  const markdown = buildDigestMarkdown(
    {
      cluster_id: 3,
      label: "근태 신청 오류",
      case_count: 12,
      top_symptoms: ["신청 버튼이 보이지 않습니다."],
      top_actions: ["메뉴 권한을 확인했습니다."],
    },
    {
      title: "근태 신청 버튼 미노출",
      symptom: "신청 버튼이 보이지 않습니다.",
      action: "권한을 확인하고 메뉴를 안내했습니다.",
      result: "resolved",
    },
  );

  assert.match(markdown, /근태 신청 오류/);
  assert.match(markdown, /신청 버튼이 보이지 않습니다/);
  assert.match(markdown, /권한을 확인하고 메뉴를 안내했습니다/);
});

test("validateImportContract accepts matching cases and clusters", () => {
  const cases = [
    normalizeCaseRow({ source_key: "tsvd999/rowid/a", title: "A", cluster_id: 1, is_digest: true }),
    normalizeCaseRow({ source_key: "tsvd999/rowid/b", title: "B", cluster_id: 1, is_digest: false }),
  ];

  assert.doesNotThrow(() =>
    validateImportContract(cases, [
      {
        cluster_id: 1,
        label: "근태 문의",
        case_count: 2,
        digest_source_key: "tsvd999/rowid/a",
      },
    ]),
  );
});

test("validateImportContract rejects stale or mismatched cluster files", () => {
  const cases = [
    normalizeCaseRow({ source_key: "tsvd999/rowid/a", title: "A", cluster_id: 1, is_digest: true }),
    normalizeCaseRow({ source_key: "tsvd999/rowid/b", title: "B", cluster_id: 2, is_digest: false }),
  ];

  assert.throws(
    () =>
      validateImportContract(cases, [
        {
          cluster_id: 1,
          label: "근태 문의",
          case_count: 2,
          digest_source_key: "tsvd999/rowid/missing",
        },
      ]),
    /case_count=2, actual=1|missing cluster_id|digest_source_key/,
  );
});
