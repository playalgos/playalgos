export const KNAPSACK_TREASURE_GAME_ID = "knapsack-treasure-bag";

export type KnapsackItem = {
  id: string;
  weight: number;
  value: number;
};

export type KnapsackRound = {
  items: KnapsackItem[];
  capacity: number;
};

export type KnapsackSelectionTotals = {
  usedWeight: number;
  selectedValue: number;
  selectedCount: number;
};

export type KnapsackSelectionValidation = KnapsackSelectionTotals & {
  isValid: boolean;
  duplicateIndices: number[];
  outOfRangeIndices: number[];
  nonIntegerIndices: number[];
  overweightBy: number;
};

export type KnapsackOptimalSolution = KnapsackSelectionTotals & {
  selectedIndices: number[];
  optimalValue: number;
};

export type KnapsackScore = {
  validation: KnapsackSelectionValidation;
  optimal: KnapsackOptimalSolution;
  efficiency: number;
  performanceDelta: number;
  isOptimal: boolean;
};

function assertRound(round: KnapsackRound): void {
  if (!Number.isInteger(round.capacity) || round.capacity < 0) {
    throw new Error("Capacity must be a non-negative integer.");
  }
  round.items.forEach((item, index) => {
    if (!Number.isInteger(item.weight) || item.weight < 0) {
      throw new Error(`Item at index ${index} has invalid weight.`);
    }
    if (!Number.isInteger(item.value) || item.value < 0) {
      throw new Error(`Item at index ${index} has invalid value.`);
    }
  });
}

export function calculateKnapsackSelectionTotals(
  round: KnapsackRound,
  selectedIndices: number[]
): KnapsackSelectionTotals {
  assertRound(round);

  const seen = new Set<number>();
  let usedWeight = 0;
  let selectedValue = 0;

  for (const rawIndex of selectedIndices) {
    if (!Number.isInteger(rawIndex)) continue;
    if (rawIndex < 0 || rawIndex >= round.items.length) continue;
    if (seen.has(rawIndex)) continue;
    seen.add(rawIndex);
    const item = round.items[rawIndex];
    usedWeight += item.weight;
    selectedValue += item.value;
  }

  return {
    usedWeight,
    selectedValue,
    selectedCount: seen.size
  };
}

export function validateKnapsackSelection(
  round: KnapsackRound,
  selectedIndices: number[]
): KnapsackSelectionValidation {
  assertRound(round);

  const seen = new Set<number>();
  const duplicateIndices: number[] = [];
  const outOfRangeIndices: number[] = [];
  const nonIntegerIndices: number[] = [];

  for (const rawIndex of selectedIndices) {
    if (!Number.isInteger(rawIndex)) {
      nonIntegerIndices.push(rawIndex);
      continue;
    }
    if (rawIndex < 0 || rawIndex >= round.items.length) {
      outOfRangeIndices.push(rawIndex);
      continue;
    }
    if (seen.has(rawIndex)) {
      duplicateIndices.push(rawIndex);
      continue;
    }
    seen.add(rawIndex);
  }

  const totals = calculateKnapsackSelectionTotals(round, selectedIndices);
  const overweightBy = Math.max(0, totals.usedWeight - round.capacity);
  const isValid =
    duplicateIndices.length === 0 &&
    outOfRangeIndices.length === 0 &&
    nonIntegerIndices.length === 0 &&
    overweightBy === 0;

  return {
    ...totals,
    isValid,
    duplicateIndices,
    outOfRangeIndices,
    nonIntegerIndices,
    overweightBy
  };
}

type DpState = {
  value: number;
  weight: number;
  count: number;
};

function betterState(current: DpState, candidate: DpState): boolean {
  if (candidate.value !== current.value) return candidate.value > current.value;
  if (candidate.weight !== current.weight) return candidate.weight < current.weight;
  return candidate.count < current.count;
}

export function solveKnapsackOptimal(round: KnapsackRound): KnapsackOptimalSolution {
  assertRound(round);
  const { items, capacity } = round;

  if (items.length === 0 || capacity === 0) {
    return {
      usedWeight: 0,
      selectedValue: 0,
      selectedCount: 0,
      selectedIndices: [],
      optimalValue: 0
    };
  }

  const itemCount = items.length;
  const dp: DpState[][] = Array.from({ length: itemCount + 1 }, () =>
    Array.from({ length: capacity + 1 }, () => ({ value: 0, weight: 0, count: 0 }))
  );
  const choose: boolean[][] = Array.from({ length: itemCount + 1 }, () =>
    Array.from({ length: capacity + 1 }, () => false)
  );

  for (let i = 1; i <= itemCount; i += 1) {
    const item = items[i - 1];
    for (let w = 0; w <= capacity; w += 1) {
      const exclude = dp[i - 1][w];
      let best = exclude;
      let picked = false;

      if (item.weight <= w) {
        const prior = dp[i - 1][w - item.weight];
        const include: DpState = {
          value: prior.value + item.value,
          weight: prior.weight + item.weight,
          count: prior.count + 1
        };
        if (betterState(best, include)) {
          best = include;
          picked = true;
        }
      }

      dp[i][w] = best;
      choose[i][w] = picked;
    }
  }

  const selectedIndices: number[] = [];
  let w = capacity;
  for (let i = itemCount; i >= 1; i -= 1) {
    if (!choose[i][w]) continue;
    selectedIndices.push(i - 1);
    w -= items[i - 1].weight;
  }
  selectedIndices.reverse();

  const best = dp[itemCount][capacity];
  return {
    usedWeight: best.weight,
    selectedValue: best.value,
    selectedCount: best.count,
    selectedIndices,
    optimalValue: best.value
  };
}

export function scoreKnapsackSelection(round: KnapsackRound, selectedIndices: number[]): KnapsackScore {
  const validation = validateKnapsackSelection(round, selectedIndices);
  const optimal = solveKnapsackOptimal(round);
  const selectedValue = validation.selectedValue;
  const optimalValue = optimal.optimalValue;
  const efficiency = optimalValue === 0 ? 1 : selectedValue / optimalValue;
  const performanceDelta = optimalValue - selectedValue;

  return {
    validation,
    optimal,
    efficiency,
    performanceDelta,
    isOptimal: validation.isValid && performanceDelta === 0
  };
}
