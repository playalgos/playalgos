// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { parseDijkstraNodeId } from "./dijkstraSecurity";

describe("dijkstra callable validation", () => {
  it("requires nodeId", () => {
    expect(() => parseDijkstraNodeId(undefined)).toThrow(HttpsError);
    expect(() => parseDijkstraNodeId("")).toThrow("nodeId is required.");
  });

  it("rejects oversized nodeId", () => {
    const tooLong = "n".repeat(65);
    expect(() => parseDijkstraNodeId(tooLong)).toThrow("nodeId is too long.");
  });

  it("accepts valid nodeId", () => {
    expect(parseDijkstraNodeId("A")).toBe("A");
    expect(parseDijkstraNodeId("node-12")).toBe("node-12");
  });
});
