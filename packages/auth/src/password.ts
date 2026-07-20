import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { PASSWORD_MAX_LENGTH, validatePasswordPolicy } from "@jarvis/shared/validation/auth";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key as Buffer)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password.slice(0, PASSWORD_MAX_LENGTH), salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex || password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
