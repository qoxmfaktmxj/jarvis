# Eval Fixtures: 2026-04

## page-qa.jsonl

30개 page-first QA fixture. recall@5 baseline runner (`apps/worker/eval/runners/page-first-baseline.ts`)에서 사용.

### Fixture schema

```jsonc
{
  "query": "사용자 질문 (한국어)",
  "expectedPages": ["wiki_page_index.path 경로"],
  "answerPatterns": [],           // reserved: 답변 substring 검증용
  "curatorUserId": "eval-curator",
  "reviewedByUserId": "eval-reviewer"
}
```

### expectedPages에 대한 주의사항

현재 `expectedPages`는 **가상 경로(placeholder)**입니다.

- `hr/onboarding/overview.md`, `eng/deploy/release-process.md` 등은 실제 wiki_page_index에 존재하는 경로가 아님
- 실제 live eval을 실행하려면 대상 workspace의 wiki_page_index를 조회하여 올바른 path 값으로 교체해야 함
- dry-run 모드에서는 구조 검증만 수행하므로 가상 경로로도 동작함

### 실제 값으로 교체하는 방법

```sql
-- 대상 workspace의 published page 목록 조회
SELECT path, title, slug
FROM wiki_page_index
WHERE workspace_id = '<WORKSPACE_ID>'
  AND published_status = 'published'
  AND stale = FALSE
ORDER BY path;
```

위 결과에서 각 query에 대응하는 정답 페이지를 찾아 `expectedPages`를 교체한다.

### 기타 fixture 파일

- `page-first-qa.jsonl` -- page-first 파이프라인 통합 테스트용
- `multi-page-ingest.jsonl` -- 다중 페이지 ingest 테스트용
- `eval-001.md ~ eval-030.md` -- 개별 eval 케이스 상세 기록
