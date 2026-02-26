export const RANGE_MIN = 1;
export const RANGE_MAX = 100;
export const GAME_ID = "binary-search";

export type GuessOutcome = "too-low" | "too-high" | "correct";

export function getRangeSize(min: number, max: number): number {
  return max - min + 1;
}

export function getOptimalAttempts(min: number, max: number): number {
  return Math.ceil(Math.log2(getRangeSize(min, max)));
}

export function generateTarget(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function evaluateGuess(guess: number, target: number): GuessOutcome {
  if (guess < target) return "too-low";
  if (guess > target) return "too-high";
  return "correct";
}

export function parseGuess(raw: string, min: number, max: number): { value: number | null; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: "Enter a number before submitting." };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { value: null, error: "Guess must be a whole number." };
  }

  if (parsed < min || parsed > max) {
    return { value: null, error: `Guess must be between ${min} and ${max}.` };
  }

  return { value: parsed, error: "" };
}

export function getPerformanceLabel(delta: number): string {
  if (delta <= 0) return "Optimal";
  if (delta === 1) return "+1 above optimal";
  return `+${delta} above optimal`;
}
