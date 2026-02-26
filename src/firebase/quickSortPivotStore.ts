import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./client";
import { QUICK_SORT_PIVOT_GAME_ID, type QuickSortState } from "../games/quickSortPivot";

type BestScore = {
  bestCost: number;
  roundsCompleted: number;
  invalidSubmits: number;
  moves: number;
  baselineCost: number;
  delta: number;
};

export type QuickSortLeaderboardEntry = {
  uid: string;
  bestCost: number;
  delta: number;
};

export async function startQuickSortSession(size = 8): Promise<QuickSortState & { sessionId: string } | null> {
  if (!functions) return null;
  const call = httpsCallable<
    { size: number },
    {
      sessionId: string;
      array: number[];
      stack: Array<{ low: number; high: number }>;
      roundsCompleted: number;
      invalidSubmits: number;
      moves: number;
      status: "playing" | "won";
    }
  >(functions, "startQuickSortSession");

  const result = await call({ size });
  return {
    sessionId: result.data.sessionId,
    array: result.data.array,
    stack: result.data.stack,
    roundsCompleted: result.data.roundsCompleted,
    invalidSubmits: result.data.invalidSubmits,
    moves: result.data.moves,
    isComplete: result.data.status === "won"
  };
}

export async function submitQuickSortPartition(params: {
  sessionId: string;
  pivotIndex: number;
  leftIndices: number[];
  rightIndices: number[];
  moveDelta: number;
}): Promise<{
  accepted: boolean;
  accuracy: number;
  balanceScore: number;
  invalidDetails:
    | {
        missingIndices: number[];
        duplicateIndices: number[];
        outOfRangeIndices: number[];
        misplacedLeftIndices: number[];
        misplacedRightIndices: number[];
      }
    | null;
  state: QuickSortState;
  totalCost?: number;
  baselineCost?: number;
  delta?: number;
  bestUpdated?: boolean;
}> {
  if (!functions) {
    throw new Error("Cloud Functions is not initialized.");
  }
  const call = httpsCallable<
    {
      sessionId: string;
      pivotIndex: number;
      leftIndices: number[];
      rightIndices: number[];
      moveDelta: number;
    },
    {
      accepted: boolean;
      accuracy: number;
      balanceScore: number;
      invalidDetails:
        | {
            missingIndices: number[];
            duplicateIndices: number[];
            outOfRangeIndices: number[];
            misplacedLeftIndices: number[];
            misplacedRightIndices: number[];
          }
        | null;
      array: number[];
      stack: Array<{ low: number; high: number }>;
      roundsCompleted: number;
      invalidSubmits: number;
      moves: number;
      status: "playing" | "won";
      totalCost?: number;
      baselineCost?: number;
      delta?: number;
      bestUpdated?: boolean;
    }
  >(functions, "submitQuickSortPartition");

  const result = await call(params);
  const data = result.data;
  return {
    accepted: data.accepted,
    accuracy: data.accuracy,
    balanceScore: data.balanceScore,
    invalidDetails: data.invalidDetails,
    state: {
      array: data.array,
      stack: data.stack,
      roundsCompleted: data.roundsCompleted,
      invalidSubmits: data.invalidSubmits,
      moves: data.moves,
      isComplete: data.status === "won"
    },
    totalCost: data.totalCost,
    baselineCost: data.baselineCost,
    delta: data.delta,
    bestUpdated: data.bestUpdated
  };
}

export async function getQuickSortBestScore(uid: string): Promise<BestScore | null> {
  if (!db) return null;
  const ref = doc(db, "users", uid, "bestScores", QUICK_SORT_PIVOT_GAME_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as BestScore;
}

export async function getQuickSortLeaderboard(limit = 10): Promise<QuickSortLeaderboardEntry[]> {
  if (!functions) return [];
  const call = httpsCallable<
    { limit: number; gameId: string },
    { entries: Array<{ uid: string; bestCost?: number; delta: number }> }
  >(functions, "getLeaderboard");
  const result = await call({ limit, gameId: QUICK_SORT_PIVOT_GAME_ID });
  return (result.data.entries ?? [])
    .filter((entry) => typeof entry.bestCost === "number")
    .map((entry) => ({
      uid: entry.uid,
      bestCost: entry.bestCost as number,
      delta: entry.delta
    }));
}
