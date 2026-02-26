// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { parseDailyKey, parseKnapsackMode, parseSelectedIndices, parseSessionId } from "./knapsackSecurity";
import { assertAuth } from "./security";

describe("knapsack callable validation", () => {
  it("requires auth uid", () => {
    expect(() => assertAuth(undefined)).toThrow(HttpsError);
    expect(() => assertAuth("")).toThrow("Authentication is required.");
  });

  it("validates sessionId", () => {
    expect(() => parseSessionId(undefined)).toThrow(HttpsError);
    expect(() => parseSessionId("")).toThrow("sessionId is required.");
    expect(parseSessionId("s1")).toBe("s1");
  });

  it("validates mode values", () => {
    expect(parseKnapsackMode(undefined)).toBe("learn");
    expect(parseKnapsackMode("challenge")).toBe("challenge");
    expect(parseKnapsackMode("speedrun")).toBe("speedrun");
    expect(() => parseKnapsackMode("standard")).toThrow("mode must be learn, challenge, or speedrun.");
  });

  it("validates dailyKey format", () => {
    expect(parseDailyKey(undefined)).toBe(null);
    expect(parseDailyKey("")).toBe(null);
    expect(parseDailyKey("2026-02-25")).toBe("2026-02-25");
    expect(() => parseDailyKey("2026/02/25")).toThrow("dailyKey must be YYYY-MM-DD.");
  });

  it("rejects invalid selectedIndices payload", () => {
    expect(() => parseSelectedIndices(undefined)).toThrow(HttpsError);
    expect(() => parseSelectedIndices([1, 2, 2.5])).toThrow("selectedIndices must contain only integers.");
    expect(() => parseSelectedIndices(["1", 2])).toThrow("selectedIndices must contain only integers.");
  });

  it("rejects oversized selectedIndices payload", () => {
    const tooLarge = Array.from({ length: 2001 }, (_, i) => i);
    expect(() => parseSelectedIndices(tooLarge)).toThrow("Selection payload is too large.");
  });

  it("accepts valid selectedIndices payload", () => {
    expect(parseSelectedIndices([0, 1, 3])).toEqual([0, 1, 3]);
  });
});
