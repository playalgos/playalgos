import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./client";
import { DIJKSTRA_PATH_STRATEGY_GAME_ID, type WeightedGraph } from "../games/dijkstraPathStrategy";

type DijkstraSessionPayload = {
  sessionId: string;
  scenarioId: string;
  graph: WeightedGraph;
  startId: string;
  targetId: string;
  distances: Record<string, number | null>;
  previous: Record<string, string | null>;
  lockedOrder: string[];
  validLocks: number;
  invalidLocks: number;
  status: "playing" | "won";
};

export type DijkstraBestScore = {
  bestCost: number;
  delta: number;
  targetDistance: number;
  optimalDistance: number;
  validLocks: number;
  invalidLocks: number;
};

export type DijkstraLeaderboardEntry = {
  uid: string;
  bestCost: number;
  delta: number;
};

export async function startDijkstraSession(): Promise<DijkstraSessionPayload | null> {
  if (!functions) return null;
  const call = httpsCallable<Record<string, never>, DijkstraSessionPayload>(functions, "startDijkstraSession");
  const result = await call({});
  return result.data;
}

export async function submitDijkstraLock(params: {
  sessionId: string;
  nodeId: string;
}): Promise<
  DijkstraSessionPayload & {
    accepted: boolean;
    reason: "ok" | "unknown-node" | "already-locked" | "not-frontier-min";
    candidateMinNodes: string[];
    targetDistance?: number | null;
    optimalDistance?: number | null;
    delta?: number;
    bestCost?: number;
    bestUpdated?: boolean;
  }
> {
  if (!functions) {
    throw new Error("Cloud Functions is not initialized.");
  }
  const call = httpsCallable<
    { sessionId: string; nodeId: string },
    DijkstraSessionPayload & {
      accepted: boolean;
      reason: "ok" | "unknown-node" | "already-locked" | "not-frontier-min";
      candidateMinNodes: string[];
      targetDistance?: number | null;
      optimalDistance?: number | null;
      delta?: number;
      bestCost?: number;
      bestUpdated?: boolean;
    }
  >(functions, "submitDijkstraLock");
  const result = await call(params);
  return result.data;
}

export async function getDijkstraBestScore(uid: string): Promise<DijkstraBestScore | null> {
  if (!db) return null;
  const ref = doc(db, "users", uid, "bestScores", DIJKSTRA_PATH_STRATEGY_GAME_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as DijkstraBestScore;
}

export async function getDijkstraLeaderboard(limit = 10): Promise<DijkstraLeaderboardEntry[]> {
  if (!functions) return [];
  const call = httpsCallable<
    { limit: number; gameId: string },
    { entries: Array<{ uid: string; bestCost?: number; delta: number }> }
  >(functions, "getLeaderboard");
  const result = await call({ limit, gameId: DIJKSTRA_PATH_STRATEGY_GAME_ID });
  return (result.data.entries ?? [])
    .filter((entry) => typeof entry.bestCost === "number")
    .map((entry) => ({
      uid: entry.uid,
      bestCost: entry.bestCost as number,
      delta: entry.delta
    }));
}
