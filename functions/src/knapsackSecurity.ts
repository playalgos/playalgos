import { HttpsError } from "firebase-functions/v2/https";

export type KnapsackMode = "learn" | "challenge" | "speedrun";

export function parseSessionId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }
  return value;
}

export function parseKnapsackMode(value: unknown): KnapsackMode {
  if (value === undefined || value === null) return "learn";
  if (value === "learn" || value === "challenge" || value === "speedrun") {
    return value;
  }
  throw new HttpsError("invalid-argument", "mode must be learn, challenge, or speedrun.");
}

export function parseDailyKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "dailyKey must be a string.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpsError("invalid-argument", "dailyKey must be YYYY-MM-DD.");
  }
  return value;
}

export function parseSelectedIndices(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "selectedIndices is required.");
  }
  if (value.length > 2000) {
    throw new HttpsError("invalid-argument", "Selection payload is too large.");
  }
  if (value.some((entry) => typeof entry !== "number" || !Number.isInteger(entry))) {
    throw new HttpsError("invalid-argument", "selectedIndices must contain only integers.");
  }
  return value as number[];
}
