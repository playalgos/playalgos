import { HttpsError } from "firebase-functions/v2/https";

export function parseDijkstraNodeId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpsError("invalid-argument", "nodeId is required.");
  }
  if (value.length > 64) {
    throw new HttpsError("invalid-argument", "nodeId is too long.");
  }
  return value;
}
