# 원천징수 검증 자료 Import 계획

## 범위

- 원천: `qoxmfaktmxj/withhold-tax` commit `fa056fec22cc38db8b40c0d7ab3c1f2b54746e37`
- 포함: `확정`, `primarySourceVerified=true`, 공식 정부·공공기관 HTTPS URL
- 제외: 강의 기반, 확인 필요, 민간 해설·법령 미러 링크, PPT/PDF/HTML 원문

## 구현

1. 검증 Fact를 하나의 추적 가능한 source snapshot으로 저장한다.
2. Fact별 Wiki 페이지를 생성해 제목과 핵심 용어가 검색되게 한다.
3. 기존 runtime Wiki에는 bundled sample 경로만 덮어쓰고 사용자 문서는 보존한다.
4. 배포 시 `samples/` 관련 변경이 있을 때만 데이터 동기화를 수행한다.

## 수용 기준

- 259건 중 기준을 통과한 208건만 생성된다.
- 각 Wiki 페이지에 법적 근거, 공식 URL, 기준일, 적용 범위, 면책 문구가 있다.
- 각 페이지가 source revision과 정확한 fact locator로 연결된다.
- 기존 서버에서 사용자 작성 Wiki 문서를 건드리지 않고 새 자료가 검색된다.
