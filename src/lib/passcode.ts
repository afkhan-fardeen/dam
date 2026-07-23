import { hash, compare } from "bcryptjs";

const ROUNDS = 10;
export const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export async function hashPasscode(passcode: string): Promise<string> {
  return hash(passcode, ROUNDS);
}

export async function verifyPasscode(
  passcode: string,
  passcodeHash: string,
): Promise<boolean> {
  return compare(passcode, passcodeHash);
}

export function unlockExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + UNLOCK_TTL_MS);
}
