import { HttpsError } from "firebase-functions/v2/https";

export function assertAuth(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  return uid;
}

export function parseIntParam(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpsError("invalid-argument", `${label} must be an integer.`);
  }
  return value;
}
