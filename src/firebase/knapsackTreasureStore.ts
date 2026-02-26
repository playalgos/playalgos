import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./client";
import { KNAPSACK_TREASURE_GAME_ID, type KnapsackItem } from "../games/knapsackTreasure";

export type KnapsackMode = "learn" | "challenge" | "speedrun";

type BestScore = {
  bestDelta: number;
  selectedValue: number;
  optimalValue: number;
  efficiency: number;
  usedWeight: number;
  capacity: number;
};

export type KnapsackLeaderboardEntry = {
  uid: string;
  bestDelta: number;
  selectedValue: number;
  delta: number;
};

export async function startKnapsackSession(): Promise<{
  sessionId: string;
  capacity: number;
  items: KnapsackItem[];
  submitAttempts: number;
  mode: KnapsackMode;
  dailyKey: string | null;
  status: "playing" | "won";
} | null> {
  if (!functions) return null;
  const call = httpsCallable<
    { mode?: KnapsackMode; dailyKey?: string },
    {
      sessionId: string;
      capacity: number;
      items: KnapsackItem[];
      submitAttempts: number;
      mode: KnapsackMode;
      dailyKey: string | null;
      status: "playing" | "won";
    }
  >(functions, "startKnapsackSession");
  const result = await call({});
  return result.data;
}

export async function startKnapsackSessionWithOptions(params: {
  mode: KnapsackMode;
  dailyKey?: string;
}): Promise<{
  sessionId: string;
  capacity: number;
  items: KnapsackItem[];
  submitAttempts: number;
  mode: KnapsackMode;
  dailyKey: string | null;
  status: "playing" | "won";
} | null> {
  if (!functions) return null;
  const call = httpsCallable<
    { mode?: KnapsackMode; dailyKey?: string },
    {
      sessionId: string;
      capacity: number;
      items: KnapsackItem[];
      submitAttempts: number;
      mode: KnapsackMode;
      dailyKey: string | null;
      status: "playing" | "won";
    }
  >(functions, "startKnapsackSession");
  const result = await call(params);
  return result.data;
}

export async function submitKnapsackSelection(params: {
  sessionId: string;
  selectedIndices: number[];
}): Promise<{
  status: "playing" | "won";
  mode: KnapsackMode;
  dailyKey: string | null;
  submitAttempts: number;
  isValid: boolean;
  usedWeight: number;
  selectedValue: number;
  selectedCount: number;
  overweightBy: number;
  duplicateIndices: number[];
  outOfRangeIndices: number[];
  optimalValue: number;
  efficiency: number;
  delta: number;
  bestUpdated?: boolean;
}> {
  if (!functions) {
    throw new Error("Cloud Functions is not initialized.");
  }
  const call = httpsCallable<
    { sessionId: string; selectedIndices: number[] },
    {
      status: "playing" | "won";
      mode: KnapsackMode;
      dailyKey: string | null;
      submitAttempts: number;
      isValid: boolean;
      usedWeight: number;
      selectedValue: number;
      selectedCount: number;
      overweightBy: number;
      duplicateIndices: number[];
      outOfRangeIndices: number[];
      optimalValue: number;
      efficiency: number;
      delta: number;
      bestUpdated?: boolean;
    }
  >(functions, "submitKnapsackSelection");
  const result = await call(params);
  return result.data;
}

export async function getKnapsackBestScore(uid: string): Promise<BestScore | null> {
  if (!db) return null;
  const ref = doc(db, "users", uid, "bestScores", KNAPSACK_TREASURE_GAME_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as BestScore;
}

export async function getKnapsackLeaderboard(limit = 10): Promise<KnapsackLeaderboardEntry[]> {
  if (!functions) return [];
  const call = httpsCallable<
    { limit: number; gameId: string },
    { entries: Array<{ uid: string; bestDelta?: number; selectedValue?: number; delta: number }> }
  >(functions, "getLeaderboard");
  const result = await call({ limit, gameId: KNAPSACK_TREASURE_GAME_ID });
  return (result.data.entries ?? [])
    .filter((entry) => typeof entry.bestDelta === "number" && typeof entry.selectedValue === "number")
    .map((entry) => ({
      uid: entry.uid,
      bestDelta: entry.bestDelta as number,
      selectedValue: entry.selectedValue as number,
      delta: entry.delta
    }));
}
