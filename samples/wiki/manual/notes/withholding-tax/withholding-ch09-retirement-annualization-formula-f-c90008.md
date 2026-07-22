---
title: "퇴직소득 연분연승 산출세액 산식"
slug: withholding-ch09-retirement-annualization-formula-f-c90008
pageType: guide
publishedStatus: published
sources:
  - sourceRevisionId: "{{sourceRevisionId:withholding-tax-verified-facts.json}}"
    locator: fact-f-c90008
    effectiveDate: 2026-06-09
    confidence: 0.78
aliases: ["소득세법 제55조 제2항"]
tags: [withholding-tax, ch9, medium]
created: 2026-06-09T00:00:00.000Z
updated: 2026-06-09T00:00:00.000Z
freshnessSlaDays: 180
---
# 퇴직소득 연분연승 산출세액 산식

퇴직소득 산출세액은 연분연승법으로 계산한다: (퇴직소득금액−근속연수공제)÷근속연수×12 = 환산급여 → 환산급여−환산급여공제 = 과세표준 → 과세표준×기본세율 = 환산산출세액 → 환산산출세액×근속연수÷12 = 퇴직소득 산출세액(소득세법 제55조 제2항).

## 근거와 적용 범위

- 법적 근거: 소득세법 제55조 제2항
- 공식 출처: [원문 확인](https://www.law.go.kr/법령/%EC%86%8C%EB%93%9D%EC%84%B8%EB%B2%95/%EC%A0%9C55%EC%A1%B0)
- 자료 기준일: 2026-06-09
- 적용 기준일: 2026-06-09
- 다음 검토일: 2027-03-31
- 적용 범위·주의: 환산급여 산식(÷근속연수×12)은 제48조, 산출세액 환원(×근속연수÷12)은 제55조 제2항. 제55조 제2항 항번호는 개정본별 인간 재확인 권장. 기본세율은 종합소득 기본세율(6~45%) 적용.

## 검증 이력

- 원천 데이터: [withhold-tax `fa056fec22cc38db8b40c0d7ab3c1f2b54746e37`](https://github.com/qoxmfaktmxj/withhold-tax/blob/fa056fec22cc38db8b40c0d7ab3c1f2b54746e37/content/facts.json)
- 포함 기준: 확정, 1차 출처 검증 완료, 정부·공공기관 공식 URL

> 이 문서는 업무 참고용이며 법률·세무 자문이 아닙니다. 실제 처리 전 최신 법령과 과세관청 안내를 다시 확인하세요.
