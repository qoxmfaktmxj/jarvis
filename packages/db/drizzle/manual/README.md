# Manual Migrations

Drizzle ORM이 자동 추적하지 않는 수동 SQL 마이그레이션.
적용 시에는 psql로 직접 실행.

| 파일 | 설명 | 적용 조건 |
|------|------|----------|
| `0001_auth_and_search_indexes.sql` | 검색/감사 인덱스 | 초기 설정 (참조용, 메인 마이그레이션 체인에 통합됨) |
| `drop_document_chunks.sql` | document_chunks DROP 의도 문서 (참조 전용) | ⚠️ 0019_absurd_scarlet_witch.sql에서 이미 실행됨 — 별도 실행 불필요 |
