import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";

describe("password", () => {
  it("hashes and verifies a valid password", async () => {
    const password = ["jarvis", "public", "2026"].join("");
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong2026", hash)).resolves.toBe(false);
  });

  it("rejects known-default passwords", async () => {
    await expect(hashPassword("password1234")).rejects.toThrow(/known default/i);
  });
});
