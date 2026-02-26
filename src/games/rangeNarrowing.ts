import { getOptimalAttempts } from "./binarySearch";

export const RANGE_NARROWING_GAME_ID = "range-narrowing";
export const RANGE_NARROWING_MIN = 1;
export const RANGE_NARROWING_MAX = 100;

export type Interval = {
  min: number;
  max: number;
};

export type PartitionChoice = "left" | "right";
export type SelectionFeedback = "inside-selected-range" | "not-inside-selected-range";

export type IntervalPartition = {
  left: Interval;
  right: Interval;
  midpoint: number;
};

export function validateInterval(interval: Interval): void {
  if (!Number.isInteger(interval.min) || !Number.isInteger(interval.max)) {
    throw new Error("Interval bounds must be integers.");
  }
  if (interval.min > interval.max) {
    throw new Error("Interval min must be less than or equal to max.");
  }
}

export function getIntervalSize(interval: Interval): number {
  validateInterval(interval);
  return interval.max - interval.min + 1;
}

export function splitInterval(interval: Interval): IntervalPartition {
  validateInterval(interval);
  if (interval.min === interval.max) {
    throw new Error("Cannot split a single-value interval.");
  }

  const midpoint = Math.floor((interval.min + interval.max) / 2);
  return {
    left: { min: interval.min, max: midpoint },
    right: { min: midpoint + 1, max: interval.max },
    midpoint
  };
}

export function applySelection(params: {
  current: Interval;
  selected: PartitionChoice;
  feedback: SelectionFeedback;
}): Interval {
  const { current, selected, feedback } = params;
  const { left, right } = splitInterval(current);
  const selectedInterval = selected === "left" ? left : right;
  const complementInterval = selected === "left" ? right : left;

  return feedback === "inside-selected-range" ? selectedInterval : complementInterval;
}

export function isWinningInterval(interval: Interval): boolean {
  validateInterval(interval);
  return interval.min === interval.max;
}

export function getOptimalSelections(interval: Interval): number {
  validateInterval(interval);
  return getOptimalAttempts(interval.min, interval.max);
}
