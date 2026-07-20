import { validatePasswordPolicy } from "@jarvis/shared/validation/auth";

export function validateBootstrapPassword(value: string): void {
  try {
    validatePasswordPolicy(value);
  } catch {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters, include letters and numbers, and not be a known default",
    );
  }
}
