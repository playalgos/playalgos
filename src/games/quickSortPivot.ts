export const QUICK_SORT_PIVOT_GAME_ID = "quick-sort-pivot";

export type SubarrayRange = {
  low: number;
  high: number;
};

export type QuickSortState = {
  array: number[];
  stack: SubarrayRange[];
  roundsCompleted: number;
  invalidSubmits: number;
  moves: number;
  isComplete: boolean;
};

export type PartitionSubmission = {
  pivotIndex: number;
  leftIndices: number[];
  rightIndices: number[];
};

export type PartitionValidation = {
  isValid: boolean;
  accuracy: number;
  misplacedLeft: number[];
  misplacedRight: number[];
  missingIndices: number[];
  duplicateIndices: number[];
  outOfRangeIndices: number[];
  expectedCount: number;
  actualCount: number;
};

export type PartitionApplyResult = {
  state: QuickSortState;
  accepted: boolean;
  validation: PartitionValidation;
  balanceScore: number;
};

function assertRange(range: SubarrayRange, arrayLength: number): void {
  if (!Number.isInteger(range.low) || !Number.isInteger(range.high)) {
    throw new Error("Range bounds must be integers.");
  }
  if (range.low < 0 || range.high >= arrayLength || range.low > range.high) {
    throw new Error("Range is out of bounds.");
  }
}

function cloneState(state: QuickSortState): QuickSortState {
  return {
    array: [...state.array],
    stack: state.stack.map((r) => ({ ...r })),
    roundsCompleted: state.roundsCompleted,
    invalidSubmits: state.invalidSubmits,
    moves: state.moves,
    isComplete: state.isComplete
  };
}

export function createQuickSortState(input: number[]): QuickSortState {
  if (input.length === 0) {
    return {
      array: [],
      stack: [],
      roundsCompleted: 0,
      invalidSubmits: 0,
      moves: 0,
      isComplete: true
    };
  }

  const stack = input.length > 1 ? [{ low: 0, high: input.length - 1 }] : [];
  return {
    array: [...input],
    stack,
    roundsCompleted: 0,
    invalidSubmits: 0,
    moves: 0,
    isComplete: stack.length === 0
  };
}

export function getActiveRange(state: QuickSortState): SubarrayRange | null {
  if (state.stack.length === 0) return null;
  return state.stack[state.stack.length - 1];
}

export function getSplitBalanceScore(leftCount: number, rightCount: number): number {
  if (leftCount < 0 || rightCount < 0) {
    throw new Error("Partition counts cannot be negative.");
  }
  if (leftCount + rightCount === 0) return 1;
  const total = leftCount + rightCount;
  const imbalance = Math.abs(leftCount - rightCount) / total;
  return 1 - imbalance;
}

export function validatePartitionSubmission(params: {
  array: number[];
  range: SubarrayRange;
  submission: PartitionSubmission;
}): PartitionValidation {
  const { array, range, submission } = params;
  assertRange(range, array.length);

  const { pivotIndex, leftIndices, rightIndices } = submission;
  if (!Number.isInteger(pivotIndex) || pivotIndex < range.low || pivotIndex > range.high) {
    throw new Error("Pivot index is out of active range.");
  }

  const expectedCount = range.high - range.low;
  const submitted = [...leftIndices, ...rightIndices];
  const actualCount = submitted.length;
  const seen = new Set<number>();
  const duplicateIndices: number[] = [];
  const outOfRangeIndices: number[] = [];

  for (const idx of submitted) {
    if (!Number.isInteger(idx)) {
      outOfRangeIndices.push(idx);
      continue;
    }
    if (idx < range.low || idx > range.high || idx === pivotIndex) {
      outOfRangeIndices.push(idx);
      continue;
    }
    if (seen.has(idx)) {
      duplicateIndices.push(idx);
      continue;
    }
    seen.add(idx);
  }

  const missingIndices: number[] = [];
  for (let i = range.low; i <= range.high; i += 1) {
    if (i === pivotIndex) continue;
    if (!seen.has(i)) missingIndices.push(i);
  }

  const pivotValue = array[pivotIndex];
  const misplacedLeft = leftIndices.filter((idx) => idx >= 0 && idx < array.length && array[idx] >= pivotValue);
  const misplacedRight = rightIndices.filter((idx) => idx >= 0 && idx < array.length && array[idx] < pivotValue);

  const issues =
    duplicateIndices.length +
    outOfRangeIndices.length +
    missingIndices.length +
    misplacedLeft.length +
    misplacedRight.length;

  const isValid = issues === 0 && actualCount === expectedCount;
  const accuracy = expectedCount === 0 ? 1 : Math.max(0, 1 - issues / expectedCount);

  return {
    isValid,
    accuracy,
    misplacedLeft,
    misplacedRight,
    missingIndices,
    duplicateIndices,
    outOfRangeIndices,
    expectedCount,
    actualCount
  };
}

export function applyPartitionSubmission(state: QuickSortState, submission: PartitionSubmission): PartitionApplyResult {
  if (state.isComplete || state.stack.length === 0) {
    throw new Error("No active quick sort range to resolve.");
  }

  const next = cloneState(state);
  const range = getActiveRange(next) as SubarrayRange;
  const validation = validatePartitionSubmission({
    array: next.array,
    range,
    submission
  });

  const balanceScore = getSplitBalanceScore(submission.leftIndices.length, submission.rightIndices.length);

  if (!validation.isValid) {
    next.invalidSubmits += 1;
    return {
      state: next,
      accepted: false,
      validation,
      balanceScore
    };
  }

  const pivotValue = next.array[submission.pivotIndex];
  const leftValues = submission.leftIndices.map((idx) => next.array[idx]);
  const rightValues = submission.rightIndices.map((idx) => next.array[idx]);
  const partitionedValues = [...leftValues, pivotValue, ...rightValues];

  for (let offset = 0; offset < partitionedValues.length; offset += 1) {
    next.array[range.low + offset] = partitionedValues[offset];
  }

  next.stack.pop();
  const pivotFinal = range.low + leftValues.length;
  const leftRange: SubarrayRange = { low: range.low, high: pivotFinal - 1 };
  const rightRange: SubarrayRange = { low: pivotFinal + 1, high: range.high };

  if (rightRange.low < rightRange.high) next.stack.push(rightRange);
  if (leftRange.low < leftRange.high) next.stack.push(leftRange);

  next.roundsCompleted += 1;
  next.isComplete = next.stack.length === 0;

  return {
    state: next,
    accepted: true,
    validation,
    balanceScore
  };
}
