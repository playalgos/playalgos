import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./client";
import { RANGE_NARROWING_GAME_ID } from "../games/rangeNarrowing";

type BestScore = {
  bestSelections: number;
  optimalSelections: number;
  delta: number;
  updatedAt?: unknown;
};

export type RangeLeaderboardEntry = {
  uid: string;
  bestSelections: number;
  delta: number;
};

export async function startRangeSession(params: {
  rangeMin: number;
  rangeMax: number;
}): Promise<{ sessionId: string; currentMin: number; currentMax: number } | null> {
  if (!functions) return null;
  const call = httpsCallable<
    { rangeMin: number; rangeMax: number },
    { sessionId: string; currentMin: number; currentMax: number }
  >(functions, "startRangeSession");
  const result = await call({
    rangeMin: params.rangeMin,
    rangeMax: params.rangeMax
  });
  return result.data;
}

export async function submitRangeSelection(params: {
  sessionId: string;
  selected: "left" | "right";
  splitPoint?: number;
}): Promise<{
  outcome: "inside-selected-range" | "not-inside-selected-range" | "correct";
  status: "playing" | "won";
  selections: number;
  penaltyApplied?: number;
  currentMin: number;
  currentMax: number;
  target?: number;
  optimalSelections?: number;
  delta?: number;
  bestUpdated?: boolean;
}> {
  if (!functions) {
    throw new Error("Cloud Functions is not initialized.");
  }
  const call = httpsCallable<
    { sessionId: string; selected: "left" | "right"; splitPoint?: number },
    {
      outcome: "inside-selected-range" | "not-inside-selected-range" | "correct";
      status: "playing" | "won";
      selections: number;
      penaltyApplied?: number;
      currentMin: number;
      currentMax: number;
      target?: number;
      optimalSelections?: number;
      delta?: number;
      bestUpdated?: boolean;
    }
  >(functions, "submitRangeSelection");
  const result = await call({
    sessionId: params.sessionId,
    selected: params.selected,
    splitPoint: params.splitPoint
  });
  return result.data;
}

export async function getRangeBestScore(uid: string): Promise<BestScore | null> {
  if (!db) return null;
  const bestRef = doc(db, "users", uid, "bestScores", RANGE_NARROWING_GAME_ID);
  const snap = await getDoc(bestRef);
  if (!snap.exists()) return null;
  return snap.data() as BestScore;
}

export async function getRangeLeaderboard(limit = 10): Promise<RangeLeaderboardEntry[]> {
  if (!functions) return [];
  const call = httpsCallable<
    { limit: number; gameId: string },
    { entries: Array<{ uid: string; bestSelections?: number; delta: number }> }
  >(functions, "getLeaderboard");
  const result = await call({ limit, gameId: RANGE_NARROWING_GAME_ID });
  return (result.data.entries ?? [])
    .filter((entry) => typeof entry.bestSelections === "number")
    .map((entry) => ({
      uid: entry.uid,
      bestSelections: entry.bestSelections as number,
      delta: entry.delta
    }));
}
