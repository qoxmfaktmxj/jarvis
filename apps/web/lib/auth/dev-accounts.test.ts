import { describe, expect, it } from "vitest";
import { findTempDevAccount } from "./dev-accounts";

describe("findTempDevAccount", () => {
  it("올바른 username/password → 계정 반환", () => {
    const account = findTempDevAccount("admin", "admin123!");
    expect(account).not.toBeNull();
    expect(account?.username).toBe("admin");
    expect(account?.email).toBe("admin@jarvis.dev");
  });

  it("잘못된 password → null", () => {
    expect(findTempDevAccount("admin", "wrong")).toBeNull();
  });

  it("존재하지 않는 username → null", () => {
    expect(findTempDevAccount("nonexistent", "admin123!")).toBeNull();
  });

  it("길이가 다른 password ('a' vs 'admin123!') → false (timing-safe)", () => {
    // timingSafeEqual은 길이가 다르면 dummy 비교 후 false를 반환해야 함.
    expect(findTempDevAccount("admin", "a")).toBeNull();
  });

  it("빈 문자열 password → null", () => {
    expect(findTempDevAccount("admin", "")).toBeNull();
  });

  it("alice 계정 → 정상 반환", () => {
    const account = findTempDevAccount("alice", "alice123!");
    expect(account).not.toBeNull();
    expect(account?.role).toBe("MANAGER");
  });

  it("bob 계정 → 정상 반환", () => {
    const account = findTempDevAccount("bob", "bob123!");
    expect(account).not.toBeNull();
    expect(account?.role).toBe("VIEWER");
  });
});
