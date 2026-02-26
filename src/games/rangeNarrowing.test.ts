import { describe, expect, it } from "vitest";
import {
  applySelection,
  getIntervalSize,
  getOptimalSelections,
  isWinningInterval,
  splitInterval
} from "./rangeNarrowing";

describe("rangeNarrowing core domain", () => {
  it("splits an even interval into equal halves", () => {
    const partition = splitInterval({ min: 1, max: 100 });
    expect(partition.left).toEqual({ min: 1, max: 50 });
    expect(partition.right).toEqual({ min: 51, max: 100 });
    expect(partition.midpoint).toBe(50);
  });

  it("splits an odd interval with left side containing midpoint", () => {
    const partition = splitInterval({ min: 1, max: 101 });
    expect(partition.left).toEqual({ min: 1, max: 51 });
    expect(partition.right).toEqual({ min: 52, max: 101 });
  });

  it("updates interval when selection contains target", () => {
    const next = applySelection({
      current: { min: 1, max: 100 },
      selected: "left",
      feedback: "inside-selected-range"
    });
    expect(next).toEqual({ min: 1, max: 50 });
  });

  it("updates interval to complement when selection misses target", () => {
    const next = applySelection({
      current: { min: 1, max: 100 },
      selected: "left",
      feedback: "not-inside-selected-range"
    });
    expect(next).toEqual({ min: 51, max: 100 });
  });

  it("handles right selection paths correctly", () => {
    const insideRight = applySelection({
      current: { min: 1, max: 100 },
      selected: "right",
      feedback: "inside-selected-range"
    });
    const outsideRight = applySelection({
      current: { min: 1, max: 100 },
      selected: "right",
      feedback: "not-inside-selected-range"
    });

    expect(insideRight).toEqual({ min: 51, max: 100 });
    expect(outsideRight).toEqual({ min: 1, max: 50 });
  });

  it("detects winning interval only for a single value", () => {
    expect(isWinningInterval({ min: 42, max: 42 })).toBe(true);
    expect(isWinningInterval({ min: 42, max: 43 })).toBe(false);
  });

  it("computes interval size and optimal selections", () => {
    expect(getIntervalSize({ min: 1, max: 100 })).toBe(100);
    expect(getOptimalSelections({ min: 1, max: 100 })).toBe(7);
    expect(getOptimalSelections({ min: 1, max: 1 })).toBe(0);
  });

  it("throws on invalid intervals", () => {
    expect(() => splitInterval({ min: 50, max: 10 })).toThrow("min must be less than or equal to max");
    expect(() => splitInterval({ min: 7, max: 7 })).toThrow("Cannot split a single-value interval");
  });
});
