import { describe, expect, it } from "vitest";
import {
  calculateKnapsackSelectionTotals,
  scoreKnapsackSelection,
  solveKnapsackOptimal,
  validateKnapsackSelection,
  type KnapsackRound
} from "./knapsackTreasure";

describe("knapsackTreasure domain", () => {
  const baseRound: KnapsackRound = {
    capacity: 7,
    items: [
      { id: "a", weight: 1, value: 1 },
      { id: "b", weight: 3, value: 4 },
      { id: "c", weight: 4, value: 5 },
      { id: "d", weight: 5, value: 7 }
    ]
  };

  it("computes selection totals with deduped valid indices", () => {
    const totals = calculateKnapsackSelectionTotals(baseRound, [1, 2, 2, 99, -1]);
    expect(totals.usedWeight).toBe(7);
    expect(totals.selectedValue).toBe(9);
    expect(totals.selectedCount).toBe(2);
  });

  it("validates duplicate, out-of-range, and overweight submissions", () => {
    const validation = validateKnapsackSelection(baseRound, [3, 3, 10]);
    expect(validation.isValid).toBe(false);
    expect(validation.duplicateIndices).toEqual([3]);
    expect(validation.outOfRangeIndices).toEqual([10]);
    expect(validation.overweightBy).toBe(0);

    const overweight = validateKnapsackSelection(baseRound, [1, 3]);
    expect(overweight.isValid).toBe(false);
    expect(overweight.usedWeight).toBe(8);
    expect(overweight.overweightBy).toBe(1);
  });

  it("solves optimal value for a standard 0/1 knapsack round", () => {
    const optimal = solveKnapsackOptimal(baseRound);
    expect(optimal.optimalValue).toBe(9);
    expect(optimal.usedWeight).toBe(7);
    expect(optimal.selectedIndices).toEqual([1, 2]);
  });

  it("handles zero-capacity and empty-item edge cases", () => {
    expect(
      solveKnapsackOptimal({
        capacity: 0,
        items: [{ id: "x", weight: 1, value: 10 }]
      }).optimalValue
    ).toBe(0);

    expect(
      solveKnapsackOptimal({
        capacity: 10,
        items: []
      }).selectedIndices
    ).toEqual([]);
  });

  it("scores efficiency and performance delta", () => {
    const score = scoreKnapsackSelection(baseRound, [0, 3]);
    expect(score.validation.isValid).toBe(true);
    expect(score.optimal.optimalValue).toBe(9);
    expect(score.efficiency).toBeCloseTo(8 / 9);
    expect(score.performanceDelta).toBe(1);
    expect(score.isOptimal).toBe(false);
  });

  it("marks optimal only when selection is valid and matches optimal value", () => {
    const optimalScore = scoreKnapsackSelection(baseRound, [1, 2]);
    expect(optimalScore.isOptimal).toBe(true);

    const invalidScore = scoreKnapsackSelection(baseRound, [1, 2, 2]);
    expect(invalidScore.performanceDelta).toBe(0);
    expect(invalidScore.isOptimal).toBe(false);
  });
});
