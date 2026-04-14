# @jarvis/search

Jarvis의 검색 진입점 패키지. **두 개의 독립된 검색 레인**을 지원하며, 이 둘은 **서로 섞이지 않는다**.

## 검색 레인

### Lane A — `document_chunks`

- **대상**: 위키(`knowledge_page`, `wiki_*`) 및 일반 문서 chunk.
- **임베딩**: OpenAI 1536d(`text-embedding-3-small` 또는 후속 모델).
- **쿼리 경로**: Phase-7B 이후 hybrid 검색 (BM25 + 벡터 + freshness + sensitivity-scoped RRF).
- **테이블**: `document_chunks` (Phase-7A PR#7에서 DDL 생성).
- **write path**: `FEATURE_DOCUMENT_CHUNKS_WRITE` 플래그. 7A 기본 off.

### Lane B — `precedent_case`

- **대상**: CS 티켓/판례/선례 케이스(TSVD999 원천 포함).
- **임베딩**: TF-IDF + Truncated SVD로 **별도 1536d 공간**에 투영(OpenAI 공간이 아님).
- **쿼리 경로**: precedent 전용 API. Lane A 쿼리와 **UNION 금지**.
- **테이블**: `precedent_case` + 관련 cluster 테이블.

## ⚠️ 절대 금지

1. **두 레인의 UNION / shared index**
   두 벡터 모두 1536d이지만, 같은 공간이 아니다. 하나의 인덱스에 INSERT 하거나 쿼리 시 UNION으로 합치면 코사인 유사도는 **무의미한 숫자**가 된다.

2. **차원 일치 = 공간 호환이라는 오해**
   TF-IDF+SVD 공간은 rare term exact match에 강하고, OpenAI 공간은 paraphrase에 강하다. 차원이 같다고 서로의 벡터를 섞으면 안 된다.

3. **"일단 같이 검색되게 해놓고 나중에 튜닝"**
   Lane 섞임은 되돌리기 어렵다. 클러스터/digest 파이프라인이 잘못된 벡터에 의존하기 시작하면 전체 재처리가 필요해진다. 통합이 필요하다면 먼저 `M1` 결정 문서를 작성한다.

## 통합 로드맵 (참고)

- **현재(7A / 7B)**: 두 레인은 **완전히 분리**. 각자 API / 각자 인덱스.
- **Phase-8 후보**: precedent_case를 OpenAI 공간으로 **재임베딩**하거나 TF-IDF ↔ OpenAI **hybrid 2채널**로 진화할 수 있음.
  - 전제: 7A eval 인프라(PR#6, G6)로 baseline 측정 완료.
  - 산출물: `docs/analysis/08-precedent-reembedding-decision.md` (작성 전). 결정 근거, 교체 vs hybrid vs 현상 유지 비교.
  - 자세한 배경: `docs/superpowers/specs/2026-04-14-phase7-v3-design.md` §7 M1.

## Revision log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-04-14 | 초안 | Phase-7 v3 spec §5.2에 따라 Lane C PR#8에서 생성 |
