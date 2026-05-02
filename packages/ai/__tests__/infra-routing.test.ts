import { describe, it, expect } from "vitest";
import { detectInfraIntent } from "../page-first/infra-routing.js";

describe("detectInfraIntent", () => {
  it.each([
    ["WHE 접속 어떻게 해?", true],
    ["legacy HR 운영 DB 비번", true],
    ["legacy HR 시스템 배포 경로", true],
    ["VPN 연결 방법", true],
    ["웹스피어 재기동 절차", true],
    ["Oracle TNS 설정", true],
    ["main.jsp 오류", true],
    ["DB 접속 정보", true],
    ["war 파일 배포", true],
    ["RD 로 접속", true],
  ])("infra 맥락 질문은 infra intent (%s)", (q, expected) => {
    expect(detectInfraIntent(q)).toBe(expected);
  });

  it.each([
    ["연차 쓰는 법 알려줘", false],
    ["올해 휴가 규정이 뭐야?", false],
    ["회사 복지 혜택", false],
    ["", false],
  ])("일반 질문은 infra intent 아님 (%s)", (q, expected) => {
    expect(detectInfraIntent(q)).toBe(expected);
  });

  it("대소문자 무관 — 'VPN' 도 인식", () => {
    expect(detectInfraIntent("VPN 접속")).toBe(true);
    expect(detectInfraIntent("vpn 접속")).toBe(true);
  });

  // Adversarial: short keywords must NOT match as substrings of unrelated words.
  // Opus reviewer P1 finding #1 (2026-04-17): `includes("db")` would match
  // "handbook", `includes("rd")` would match "standard", etc. — silently routing
  // users to infra-only shortlist and hiding correct non-infra results.
  it.each([
    ["handbook 어디서 받아?", "handbook contains 'db' as substring"],
    ["standard 운영 지침", "standard contains 'rd'"],
    ["classification 기준이 뭐야?", "classification contains 'class'"],
    ["warning 경고 메시지", "warning contains 'war'"],
    ["software 업데이트", "software contains 'war' as substring"],
    ["dashboard 사용법", "dashboard contains 'db' and 'rd'"],
    ["sidebar 메뉴", "sidebar contains 'db'"],
    ["jasmine 차 맛있어", "jasmine contains 'sid' substring? no — but test anyway"],
  ])("FP guard: '%s' (%s) 은 infra intent 아님", (q) => {
    expect(detectInfraIntent(q)).toBe(false);
  });

  // The short keywords still match when they appear as standalone tokens.
  it.each([
    ["쿼리 결과가 db 에서 안 나와", true],
    ["운영 rd 서버 주소", true],
    ["WAS 가 응답이 없어", true],
  ])(
    "short keyword '%s' 은 word-boundary 안에선 여전히 match",
    (q, expected) => {
      expect(detectInfraIntent(q)).toBe(expected);
    },
  );
});
