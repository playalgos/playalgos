import { describe, expect, it } from "vitest";
import {
  evaluateGuess,
  getOptimalAttempts,
  getPerformanceLabel,
  parseGuess
} from "./binarySearch";

describe("binarySearch core logic", () => {
  it("evaluates guess direction correctly", () => {
    expect(evaluateGuess(30, 42)).toBe("too-low");
    expect(evaluateGuess(51, 42)).toBe("too-high");
    expect(evaluateGuess(42, 42)).toBe("correct");
  });

  it("computes optimal attempts with binary-search formula", () => {
    expect(getOptimalAttempts(1, 100)).toBe(7);
    expect(getOptimalAttempts(1, 8)).toBe(3);
  });

  it("validates guess input", () => {
    expect(parseGuess("", 1, 100).error).toContain("Enter a number");
    expect(parseGuess("3.2", 1, 100).error).toContain("whole number");
    expect(parseGuess("200", 1, 100).error).toContain("between 1 and 100");
    expect(parseGuess("50", 1, 100).value).toBe(50);
  });

  it("formats performance labels", () => {
    expect(getPerformanceLabel(0)).toBe("Optimal");
    expect(getPerformanceLabel(1)).toBe("+1 above optimal");
    expect(getPerformanceLabel(3)).toBe("+3 above optimal");
  });
});
