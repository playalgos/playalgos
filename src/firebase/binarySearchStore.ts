import {
  doc,
  getDoc
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "./client";

type BestScore = {
  bestAttempts: number;
  optimalAttempts: number;
  delta: number;
  updatedAt?: unknown;
};

type LeaderboardEntry = {
  uid: string;
  bestAttempts: number;
  delta: number;
};

export async function startSession(params: {
  rangeMin: number;
  rangeMax: number;
}): Promise<string | null> {
  if (!functions) return null;
  const call = httpsCallable<{ rangeMin: number; rangeMax: number }, { sessionId: string }>(
    functions,
    "startSession"
  );
  const result = await call({ rangeMin: params.rangeMin, rangeMax: params.rangeMax });
  return result.data.sessionId;
}

export async function submitGuess(params: {
  sessionId: string;
  guess: number;
}): Promise<{
  outcome: "too-low" | "too-high" | "correct";
  attempts: number;
  status: "playing" | "won";
  target?: number;
  optimalAttempts?: number;
  delta?: number;
  bestUpdated?: boolean;
}> {
  if (!functions) {
    throw new Error("Cloud Functions is not initialized.");
  }
  const call = httpsCallable<
    { sessionId: string; guess: number },
    {
      outcome: "too-low" | "too-high" | "correct";
      attempts: number;
      status: "playing" | "won";
      target?: number;
      optimalAttempts?: number;
      delta?: number;
      bestUpdated?: boolean;
    }
  >(functions, "submitGuess");
  const result = await call({
    sessionId: params.sessionId,
    guess: params.guess
  });
  return result.data;
}

export async function getBestScore(uid: string): Promise<BestScore | null> {
  if (!db) return null;

  const bestRef = doc(db, "users", uid, "bestScores", "binary-search");
  const snap = await getDoc(bestRef);
  if (!snap.exists()) return null;

  return snap.data() as BestScore;
}
export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  if (!functions) return [];
  const call = httpsCallable<{ limit: number; gameId: string }, { entries: LeaderboardEntry[] }>(
    functions,
    "getLeaderboard"
  );
  const result = await call({ limit, gameId: "binary-search" });
  return result.data.entries ?? [];
}
