import { describe, expect, it } from "vitest";
import {
  applyPartitionSubmission,
  createQuickSortState,
  getActiveRange,
  getSplitBalanceScore,
  validatePartitionSubmission
} from "./quickSortPivot";

describe("quickSortPivot domain", () => {
  it("creates initial state with active full range", () => {
    const state = createQuickSortState([4, 2, 7, 1]);
    expect(state.isComplete).toBe(false);
    expect(getActiveRange(state)).toEqual({ low: 0, high: 3 });
  });

  it("returns complete state for empty and single arrays", () => {
    expect(createQuickSortState([]).isComplete).toBe(true);
    expect(createQuickSortState([5]).isComplete).toBe(true);
  });

  it("validates a correct partition submission", () => {
    const validation = validatePartitionSubmission({
      array: [4, 2, 7, 1],
      range: { low: 0, high: 3 },
      submission: {
        pivotIndex: 0,
        leftIndices: [1, 3],
        rightIndices: [2]
      }
    });

    expect(validation.isValid).toBe(true);
    expect(validation.accuracy).toBe(1);
  });

  it("detects misplaced, missing, and duplicate indices", () => {
    const validation = validatePartitionSubmission({
      array: [4, 2, 7, 1],
      range: { low: 0, high: 3 },
      submission: {
        pivotIndex: 0,
        leftIndices: [2, 2],
        rightIndices: []
      }
    });

    expect(validation.isValid).toBe(false);
    expect(validation.misplacedLeft).toEqual([2, 2]);
    expect(validation.duplicateIndices).toEqual([2]);
    expect(validation.missingIndices).toContain(1);
    expect(validation.missingIndices).toContain(3);
  });

  it("applies valid partition and advances quick-sort stack", () => {
    const initial = createQuickSortState([4, 2, 7, 1]);
    const result = applyPartitionSubmission(initial, {
      pivotIndex: 0,
      leftIndices: [1, 3],
      rightIndices: [2]
    });

    expect(result.accepted).toBe(true);
    expect(result.state.array).toEqual([2, 1, 4, 7]);
    expect(result.state.roundsCompleted).toBe(1);
    expect(result.state.isComplete).toBe(false);
    expect(getActiveRange(result.state)).toEqual({ low: 0, high: 1 });
  });

  it("does not advance state on invalid partition", () => {
    const initial = createQuickSortState([4, 2, 7, 1]);
    const result = applyPartitionSubmission(initial, {
      pivotIndex: 0,
      leftIndices: [2],
      rightIndices: [1, 3]
    });

    expect(result.accepted).toBe(false);
    expect(result.state.array).toEqual([4, 2, 7, 1]);
    expect(result.state.roundsCompleted).toBe(0);
    expect(result.state.invalidSubmits).toBe(1);
  });

  it("completes sorting progression after resolving all subranges", () => {
    const state1 = applyPartitionSubmission(createQuickSortState([3, 1, 2]), {
      pivotIndex: 0,
      leftIndices: [1, 2],
      rightIndices: []
    }).state;
    const state2 = applyPartitionSubmission(state1, {
      pivotIndex: 0,
      leftIndices: [],
      rightIndices: [1]
    }).state;

    expect(state2.array).toEqual([1, 2, 3]);
    expect(state2.isComplete).toBe(true);
    expect(state2.stack).toEqual([]);
  });

  it("computes split-balance score", () => {
    expect(getSplitBalanceScore(5, 5)).toBe(1);
    expect(getSplitBalanceScore(9, 1)).toBeCloseTo(0.2);
  });
});
