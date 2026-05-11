import { describe, it, expect, vi } from "vitest";
import {
  buildAuditLogRow,
  buildDiff,
  maskSensitive,
  writeAuditLog,
  type AuditLogInput,
  type AuditTx,
} from "../audit-log.js";

describe("maskSensitive", () => {
  it("returns primitives unchanged", () => {
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive(undefined)).toBeUndefined();
    expect(maskSensitive("plain")).toBe("plain");
    expect(maskSensitive(42)).toBe(42);
    expect(maskSensitive(true)).toBe(true);
  });

  it("masks top-level sensitive keys", () => {
    const out = maskSensitive({
      username: "alice",
      password: "hunter2",
      token: "abc",
      apiKey: "xyz",
    });
    expect(out).toEqual({
      username: "alice",
      password: "[REDACTED]",
      token: "[REDACTED]",
      apiKey: "[REDACTED]",
    });
  });

  it("matches snake_case and camelCase variants", () => {
    const out = maskSensitive({
      password_hash: "h1",
      passwordHash: "h2",
      access_token: "t1",
      refreshToken: "t2",
      client_secret: "s1",
      privateKey: "p1",
    });
    expect(out).toEqual({
      password_hash: "[REDACTED]",
      passwordHash: "[REDACTED]",
      access_token: "[REDACTED]",
      refreshToken: "[REDACTED]",
      client_secret: "[REDACTED]",
      privateKey: "[REDACTED]",
    });
  });

  it("recurses into nested objects", () => {
    const out = maskSensitive({
      outer: {
        password: "x",
        inner: { token: "y", note: "z" },
      },
    }) as { outer: { password: string; inner: { token: string; note: string } } };
    expect(out.outer.password).toBe("[REDACTED]");
    expect(out.outer.inner.token).toBe("[REDACTED]");
    expect(out.outer.inner.note).toBe("z");
  });

  it("masks objects inside arrays", () => {
    const out = maskSensitive([
      { user: "a", password: "1" },
      { user: "b", password: "2" },
    ]) as Array<{ user: string; password: string }>;
    expect(out[0]?.password).toBe("[REDACTED]");
    expect(out[1]?.password).toBe("[REDACTED]");
    expect(out[0]?.user).toBe("a");
  });

  it("does not mask similar-looking but non-sensitive keys", () => {
    const out = maskSensitive({
      title: "ok",
      passport: "ok-strict-substring-test",
    }) as { title: string; passport: string };
    expect(out.title).toBe("ok");
    // 'passport' contains 'passpor' not 'password' — should NOT be masked.
    expect(out.passport).toBe("ok-strict-substring-test");
  });

  it("does not infinite-loop on cycles", () => {
    type CyclicNode = { name: string; self?: CyclicNode };
    const cyclic: CyclicNode = { name: "x" };
    cyclic.self = cyclic;
    expect(() => maskSensitive(cyclic)).not.toThrow();
  });

  it("preserves Date objects (non-plain) unchanged", () => {
    const date = new Date("2026-05-11T00:00:00Z");
    const out = maskSensitive({ when: date, password: "x" }) as {
      when: Date;
      password: string;
    };
    expect(out.when).toBeInstanceOf(Date);
    expect(out.when.getTime()).toBe(date.getTime());
    expect(out.password).toBe("[REDACTED]");
  });

  it("masks passwordRef (used by project_access)", () => {
    const out = maskSensitive({
      passwordRef: "secret://kv/abc",
      usernameRef: "alice",
    }) as { passwordRef: string; usernameRef: string };
    expect(out.passwordRef).toBe("[REDACTED]");
    // usernameRef is NOT in sensitive list — pattern only matches *password*/token/secret/etc.
    expect(out.usernameRef).toBe("alice");
  });
});

describe("buildDiff", () => {
  it("returns null when before or after is missing", () => {
    expect(buildDiff(undefined, { a: 1 })).toBeNull();
    expect(buildDiff({ a: 1 }, undefined)).toBeNull();
    expect(buildDiff(null, { a: 1 })).toBeNull();
  });

  it("reports only changed keys", () => {
    const diff = buildDiff({ a: 1, b: 2, c: 3 }, { a: 1, b: 99, c: 3 });
    expect(diff?.changed).toEqual(["b"]);
    expect(diff?.before).toEqual({ b: 2 });
    expect(diff?.after).toEqual({ b: 99 });
  });

  it("masks sensitive keys in both before and after", () => {
    const diff = buildDiff(
      { name: "old", password: "p1" },
      { name: "new", password: "p2" },
    );
    expect(diff?.changed.sort()).toEqual(["name", "password"]);
    expect(diff?.before.password).toBe("[REDACTED]");
    expect(diff?.after.password).toBe("[REDACTED]");
    expect(diff?.before.name).toBe("old");
    expect(diff?.after.name).toBe("new");
  });

  it("handles added and removed keys", () => {
    const diff = buildDiff({ a: 1 }, { b: 2 });
    expect(diff?.changed.sort()).toEqual(["a", "b"]);
    expect(diff?.before).toEqual({ a: 1, b: undefined });
    expect(diff?.after).toEqual({ a: undefined, b: 2 });
  });
});

describe("buildAuditLogRow", () => {
  const base: AuditLogInput = {
    workspaceId: "ws-1",
    userId: "user-1",
    action: "notice.create",
    resourceType: "notice",
  };

  it("produces a row with masked details and sane defaults", () => {
    const row = buildAuditLogRow({
      ...base,
      resourceId: "n-1",
      details: { title: "T", apiKey: "leaked" },
    });
    expect(row).toMatchObject({
      workspaceId: "ws-1",
      userId: "user-1",
      action: "notice.create",
      resourceType: "notice",
      resourceId: "n-1",
      ipAddress: null,
      userAgent: null,
      success: true,
      errorMessage: null,
    });
    expect(row.details).toEqual({ title: "T", apiKey: "[REDACTED]" });
  });

  it("defaults details to empty object", () => {
    const row = buildAuditLogRow(base);
    expect(row.details).toEqual({});
  });

  it("wraps scalar details into { value }", () => {
    const row = buildAuditLogRow({ ...base, details: "scalar" });
    expect(row.details).toEqual({ value: "scalar" });
  });

  it("attaches diff under details.diff when before+after present", () => {
    const row = buildAuditLogRow({
      ...base,
      action: "notice.update",
      resourceId: "n-1",
      before: { title: "old", password: "p1" },
      after: { title: "new", password: "p2" },
    });
    const diff = row.details["diff"] as
      | { changed: string[]; before: Record<string, unknown>; after: Record<string, unknown> }
      | undefined;
    expect(diff).toBeDefined();
    expect(diff?.changed.sort()).toEqual(["password", "title"]);
    expect(diff?.before["password"]).toBe("[REDACTED]");
    expect(diff?.after["password"]).toBe("[REDACTED]");
  });

  it("does not overwrite explicit details.diff if caller provided one", () => {
    const row = buildAuditLogRow({
      ...base,
      action: "notice.update",
      resourceId: "n-1",
      details: { diff: "custom-override" },
      before: { x: 1 },
      after: { x: 2 },
    });
    expect(row.details["diff"]).toBe("custom-override");
  });

  it("preserves success=false when explicitly set", () => {
    const row = buildAuditLogRow({
      ...base,
      success: false,
      errorMessage: "boom",
    });
    expect(row.success).toBe(false);
    expect(row.errorMessage).toBe("boom");
  });
});

describe("writeAuditLog", () => {
  it("inserts a single row into the provided audit table", async () => {
    const valuesFn = vi.fn().mockResolvedValue(undefined);
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const fakeTx: AuditTx = { insert: insertFn };
    const auditTable = { _table: "audit_log" };

    await writeAuditLog(fakeTx, auditTable, {
      workspaceId: "ws-1",
      userId: "user-1",
      action: "notice.create",
      resourceType: "notice",
      resourceId: "n-1",
      details: { password: "secret", title: "T" },
    });

    expect(insertFn).toHaveBeenCalledWith(auditTable);
    expect(valuesFn).toHaveBeenCalledTimes(1);
    const row = valuesFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row["action"]).toBe("notice.create");
    expect(row["resourceId"]).toBe("n-1");
    expect((row["details"] as Record<string, unknown>)["password"]).toBe(
      "[REDACTED]",
    );
    expect((row["details"] as Record<string, unknown>)["title"]).toBe("T");
  });
});
