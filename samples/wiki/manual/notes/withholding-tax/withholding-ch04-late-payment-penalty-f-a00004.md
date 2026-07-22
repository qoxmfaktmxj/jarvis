---
title: "원천징수 납부지연가산세"
slug: withholding-ch04-late-payment-penalty-f-a00004
pageType: guide
publishedStatus: published
sources:
  - sourceRevisionId: "{{sourceRevisionId:withholding-tax-verified-facts.json}}"
    locator: fact-f-a00004
    effectiveDate: 2022-02-15
    confidence: 0.9
aliases: ["국세기본법 제47조의5"]
tags: [withholding-tax, ch4, medium]
created: 2026-06-09T00:00:00.000Z
updated: 2026-06-09T00:00:00.000Z
freshnessSlaDays: 180
---
# 원천징수 납부지연가산세

원천징수 등 납부지연가산세(국세기본법 제47조의5) = 미납세액×3% + (미납세액×22/10만×법정납부기한 다음날~납부일 경과일수). 전체 한도는 미납세액의 50%, '3%+법정납부기한 다음날~납부고지일 기간분' 합계는 미납세액 10% 한도. 이자율 22/10만(1일 10만분의22)은 2022.2.15 인하 이후 2026년 현재 동일.

## 근거와 적용 범위

- 법적 근거: 국세기본법 제47조의5
- 공식 출처: [원문 확인](https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2292&cntntsId=7704)
- 자료 기준일: 2026-06-09
- 적용 기준일: 2022-02-15
- 다음 검토일: 2027-03-31
- 적용 범위·주의: 원주장은 한도 누락 → 50%/10% 한도 병기 필수. 본 산식은 국세분 한정(지방소득세 특별징수분은 지방세기본법 별도). 파일럿 fact 재사용(id 유지).

## 검증 이력

- 원천 데이터: [withhold-tax `fa056fec22cc38db8b40c0d7ab3c1f2b54746e37`](https://github.com/qoxmfaktmxj/withhold-tax/blob/fa056fec22cc38db8b40c0d7ab3c1f2b54746e37/content/facts.json)
- 포함 기준: 확정, 1차 출처 검증 완료, 정부·공공기관 공식 URL

> 이 문서는 업무 참고용이며 법률·세무 자문이 아닙니다. 실제 처리 전 최신 법령과 과세관청 안내를 다시 확인하세요.
