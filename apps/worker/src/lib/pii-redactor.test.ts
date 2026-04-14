import { describe, expect, it } from "vitest";
import {
  redactPII,
  detectSecretKeywords,
  computeSensitivity,
} from "./pii-redactor.js";

describe("redactPII — SSN (주민번호)", () => {
  it("redacts a bare SSN", () => {
    const { redacted, hits } = redactPII("홍길동 900101-1234567 문의");
    expect(redacted).toBe("홍길동 [REDACTED_SSN] 문의");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe("ssn");
  });

  it("redacts multiple SSNs in one string", () => {
    const { redacted, hits } = redactPII("A 010101-3000000, B 020202-4000000");
    expect(redacted).toBe("A [REDACTED_SSN], B [REDACTED_SSN]");
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.kind === "ssn")).toBe(true);
  });

  it("records correct span for SSN", () => {
    const input = "ID 900101-1234567 END";
    const { hits } = redactPII(input);
    expect(hits[0]!.span[0]).toBe(3);
    expect(hits[0]!.span[1]).toBe(17);
  });

  it("does not match 6-7 with wrong separator", () => {
    const { hits } = redactPII("900101.1234567 and 900101 1234567");
    expect(hits.filter((h) => h.kind === "ssn")).toHaveLength(0);
  });

  it("does not redact plain numeric strings", () => {
    const { redacted, hits } = redactPII("주문번호 12345678901234");
    expect(redacted).toBe("주문번호 12345678901234");
    expect(hits).toHaveLength(0);
  });

  it("should NOT flag order numbers as SSN", () => {
    // 202401-1234567: month part is "24" which is not a valid month (01-12)
    const text = "주문번호: 202401-1234567호 처리완료";
    const { redacted, hits } = redactPII(text);
    expect(hits.filter((h) => h.kind === "ssn")).toHaveLength(0);
    expect(redacted).toBe(text);
  });
});

describe("redactPII — phone (전화)", () => {
  it("redacts 010 mobile", () => {
    const { redacted, hits } = redactPII("연락 010-1234-5678 부탁");
    expect(redacted).toBe("연락 [REDACTED_PHONE] 부탁");
    expect(hits[0]!.kind).toBe("phone");
  });

  it("redacts 011 legacy mobile 3-digit middle", () => {
    const { redacted } = redactPII("011-123-4567");
    expect(redacted).toBe("[REDACTED_PHONE]");
  });

  it("redacts 02 seoul landline", () => {
    const { redacted } = redactPII("02-345-6789");
    expect(redacted).toBe("[REDACTED_PHONE]");
  });

  it("redacts 02 seoul landline with 4-digit middle", () => {
    const { redacted } = redactPII("회사 02-3456-7890 입니다");
    expect(redacted).toBe("회사 [REDACTED_PHONE] 입니다");
  });

  it("does not redact random digit groups", () => {
    const { hits } = redactPII("버전 12-34-56 릴리스");
    expect(hits.filter((h) => h.kind === "phone")).toHaveLength(0);
  });
});

describe("redactPII — email", () => {
  it("redacts simple email", () => {
    const { redacted, hits } = redactPII("문의 a@b.com");
    expect(redacted).toBe("문의 [REDACTED_EMAIL]");
    expect(hits[0]!.kind).toBe("email");
  });

  it("redacts email with dots and plus", () => {
    const { redacted } = redactPII("john.doe+work@sub.example.co.kr");
    expect(redacted).toBe("[REDACTED_EMAIL]");
  });

  it("redacts multiple emails", () => {
    const { hits } = redactPII("a@b.com, c@d.kr");
    expect(hits.filter((h) => h.kind === "email")).toHaveLength(2);
  });

  it("records email span", () => {
    const { hits } = redactPII("email: a@b.com end");
    expect(hits[0]!.span[0]).toBe(7);
  });

  it("does not match bare domain", () => {
    const { hits } = redactPII("도메인 example.com 참조");
    expect(hits.filter((h) => h.kind === "email")).toHaveLength(0);
  });
});

describe("redactPII — card", () => {
  it("redacts hyphen-separated card", () => {
    const { redacted, hits } = redactPII("카드 4111-1111-1111-1111 결제");
    expect(redacted).toBe("카드 [REDACTED_CARD] 결제");
    expect(hits[0]!.kind).toBe("card");
  });

  it("redacts space-separated card", () => {
    const { redacted } = redactPII("5555 4444 3333 2222");
    expect(redacted).toBe("[REDACTED_CARD]");
  });

  it("redacts card in middle of sentence", () => {
    const { hits } = redactPII("번호 1234-5678-9012-3456 입니다");
    expect(hits.filter((h) => h.kind === "card")).toHaveLength(1);
  });

  it("does not redact 3-group numbers", () => {
    const { hits } = redactPII("3333 4444 5555");
    expect(hits.filter((h) => h.kind === "card")).toHaveLength(0);
  });

  it("does not redact 17+ digit runs", () => {
    const { hits } = redactPII("12345678901234567");
    expect(hits.filter((h) => h.kind === "card")).toHaveLength(0);
  });
});

describe("detectSecretKeywords", () => {
  it("detects 비밀번호 / password", () => {
    expect(detectSecretKeywords("비밀번호는 abc").sort()).toEqual(["비밀번호"]);
    expect(detectSecretKeywords("password=abc").sort()).toEqual(["password"]);
  });

  it("detects api_key / secret_key / private_key", () => {
    const hits = detectSecretKeywords(
      "api_key=x, secret_key=y, private_key=z",
    ).sort();
    expect(hits).toEqual(["api_key", "private_key", "secret_key"]);
  });

  it("returns empty for clean text", () => {
    expect(detectSecretKeywords("오늘 날씨")).toEqual([]);
  });

  it("is case-insensitive for English", () => {
    expect(detectSecretKeywords("PASSWORD=x")).toEqual(["password"]);
  });

  it("deduplicates repeated hits", () => {
    expect(detectSecretKeywords("password password password")).toEqual([
      "password",
    ]);
  });
});

describe("computeSensitivity", () => {
  it("SECRET_REF_ONLY on secret keyword", () => {
    expect(computeSensitivity("비밀번호: abc", "PUBLIC")).toBe(
      "SECRET_REF_ONLY",
    );
  });

  it("upgrades PUBLIC to INTERNAL on PII", () => {
    expect(computeSensitivity("email a@b.com", "PUBLIC")).toBe("INTERNAL");
  });

  it("does not downgrade RESTRICTED", () => {
    expect(computeSensitivity("a@b.com", "RESTRICTED")).toBe("RESTRICTED");
  });

  it("keeps caller default when clean", () => {
    expect(computeSensitivity("안녕하세요", "INTERNAL")).toBe("INTERNAL");
  });

  it("SECRET wins over PII", () => {
    expect(computeSensitivity("a@b.com password=x", "PUBLIC")).toBe(
      "SECRET_REF_ONLY",
    );
  });
});
