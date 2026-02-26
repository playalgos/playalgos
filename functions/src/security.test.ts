// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { assertAuth, parseIntParam } from "./security";

describe("functions security helpers", () => {
  it("throws unauthenticated when uid is missing", () => {
    expect(() => assertAuth(undefined)).toThrow(HttpsError);
    expect(() => assertAuth("")).toThrow("Authentication is required.");
  });

  it("returns uid when provided", () => {
    expect(assertAuth("user-1")).toBe("user-1");
  });

  it("rejects non-integer input", () => {
    expect(() => parseIntParam("3", "guess")).toThrow(HttpsError);
    expect(() => parseIntParam(2.7, "guess")).toThrow("must be an integer");
  });

  it("accepts integer input", () => {
    expect(parseIntParam(10, "guess")).toBe(10);
  });
});
