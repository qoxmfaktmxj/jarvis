// WARNING: Development-only accounts with plaintext passwords.
// These credentials are NOT secrets — they exist only for local development convenience.

import { timingSafeEqual } from "node:crypto";

export const TEMP_DEV_ACCOUNTS = [
  {
    label: "Admin User",
    role: "ADMIN",
    username: "admin",
    password: "admin123!",
    email: "admin@jarvis.dev",
  },
  {
    label: "Alice Kim",
    role: "MANAGER",
    username: "alice",
    password: "alice123!",
    email: "alice@jarvis.dev",
  },
  {
    label: "Bob Lee",
    role: "VIEWER",
    username: "bob",
    password: "bob123!",
    email: "bob@jarvis.dev",
  },
] as const;

/** Constant-time string comparison. Length mismatch performs a dummy comparison to equalise timing. */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Perform dummy comparison so timing is not influenced by length mismatch.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function findTempDevAccount(username: string, password: string) {
  let matched: (typeof TEMP_DEV_ACCOUNTS)[number] | undefined;
  for (const account of TEMP_DEV_ACCOUNTS) {
    // Iterate all entries without short-circuit to prevent timing leaks.
    if (safeEqual(account.username, username) && safeEqual(account.password, password)) {
      matched = account;
    }
  }
  return matched ?? null;
}
