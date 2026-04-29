import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  return new Promise<boolean>((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, (err, derivedKey) => {
      if (err) reject(err);
      else {
        try {
          resolve(timingSafeEqual(derivedKey, hashBuffer));
        } catch {
          resolve(false);
        }
      }
    });
  });
}
