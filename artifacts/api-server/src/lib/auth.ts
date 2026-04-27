import crypto from "crypto";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "erp_salt_2024").digest("hex");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
