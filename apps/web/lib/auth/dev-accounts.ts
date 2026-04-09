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

export function findTempDevAccount(username: string, password: string) {
  return TEMP_DEV_ACCOUNTS.find(
    (account) => account.username === username && account.password === password
  );
}
