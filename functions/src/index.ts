import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertAuth, parseIntParam } from "./security.js";
import { parseDijkstraNodeId } from "./dijkstraSecurity.js";
import {
  parseDailyKey,
  parseKnapsackMode,
  parseSelectedIndices,
  parseSessionId,
  type KnapsackMode
} from "./knapsackSecurity.js";

initializeApp();
const db = getFirestore();

const BINARY_GAME_ID = "binary-search";
const RANGE_GAME_ID = "range-narrowing";
const QUICK_SORT_GAME_ID = "quick-sort-pivot";
const KNAPSACK_GAME_ID = "knapsack-treasure-bag";
const DIJKSTRA_GAME_ID = "dijkstra-path-strategy";
const SESSION_SECRET_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SessionDoc = {
  gameId: string;
  rangeMin: number;
  rangeMax: number;
  attempts: number;
  status: "playing" | "won";
  feedback?: "too-low" | "too-high" | "correct";
};

type RangeSessionDoc = {
  gameId: string;
  rangeMin: number;
  rangeMax: number;
  currentMin: number;
  currentMax: number;
  selections: number;
  status: "playing" | "won";
  feedback?: "inside-selected-range" | "not-inside-selected-range" | "correct";
};

type QuickSortRange = {
  low: number;
  high: number;
};

type QuickSortSessionDoc = {
  gameId: string;
  array: number[];
  stack: QuickSortRange[];
  roundsCompleted: number;
  invalidSubmits: number;
  moves: number;
  status: "playing" | "won";
};

type KnapsackItem = {
  id: string;
  weight: number;
  value: number;
};

type KnapsackSessionDoc = {
  gameId: string;
  capacity: number;
  items: KnapsackItem[];
  submitAttempts: number;
  mode: KnapsackMode;
  dailyKey?: string | null;
  status: "playing" | "won";
};

type DijkstraEdge = {
  to: string;
  weight: number;
};

type DijkstraGraph = {
  nodes: string[];
  adjacency: Record<string, DijkstraEdge[]>;
};

type DijkstraSessionDoc = {
  gameId: string;
  scenarioId: string;
  graph: DijkstraGraph;
  startId: string;
  targetId: string;
  distances: Record<string, number>;
  previous: Record<string, string | null>;
  lockedOrder: string[];
  validLocks: number;
  invalidLocks: number;
  status: "playing" | "won";
  expiresAt?: Timestamp;
};

function toMidpoint(min: number, max: number): number {
  return Math.floor((min + max) / 2);
}

function ensureSupportedGameId(gameIdRaw: unknown): string {
  const gameId = typeof gameIdRaw === "string" ? gameIdRaw : BINARY_GAME_ID;
  if (
    gameId !== BINARY_GAME_ID &&
    gameId !== RANGE_GAME_ID &&
    gameId !== QUICK_SORT_GAME_ID &&
    gameId !== KNAPSACK_GAME_ID &&
    gameId !== DIJKSTRA_GAME_ID
  ) {
    throw new HttpsError("invalid-argument", "Unsupported gameId.");
  }
  return gameId;
}

const DIJKSTRA_SCENARIOS: Array<{
  id: string;
  startId: string;
  targetId: string;
  graph: DijkstraGraph;
}> = [
  {
    id: "city-1",
    startId: "A",
    targetId: "D",
    graph: {
      nodes: ["A", "B", "C", "D"],
      adjacency: {
        A: [
          { to: "B", weight: 2 },
          { to: "C", weight: 5 }
        ],
        B: [
          { to: "C", weight: 1 },
          { to: "D", weight: 4 }
        ],
        C: [{ to: "D", weight: 1 }],
        D: []
      }
    }
  },
  {
    id: "city-2",
    startId: "S",
    targetId: "T",
    graph: {
      nodes: ["S", "U", "V", "W", "T"],
      adjacency: {
        S: [
          { to: "U", weight: 3 },
          { to: "V", weight: 6 }
        ],
        U: [
          { to: "V", weight: 2 },
          { to: "W", weight: 4 }
        ],
        V: [{ to: "T", weight: 3 }],
        W: [{ to: "T", weight: 2 }],
        T: []
      }
    }
  }
];

function cloneDijkstraGraph(graph: DijkstraGraph): DijkstraGraph {
  return {
    nodes: [...graph.nodes],
    adjacency: Object.fromEntries(
      Object.entries(graph.adjacency).map(([node, edges]) => [node, edges.map((edge) => ({ ...edge }))])
    )
  };
}

function createDijkstraInitialState(scenario: {
  id: string;
  startId: string;
  targetId: string;
  graph: DijkstraGraph;
}): DijkstraSessionDoc {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  for (const node of scenario.graph.nodes) {
    distances[node] = Number.POSITIVE_INFINITY;
    previous[node] = null;
  }
  distances[scenario.startId] = 0;
  return {
    gameId: DIJKSTRA_GAME_ID,
    scenarioId: scenario.id,
    graph: cloneDijkstraGraph(scenario.graph),
    startId: scenario.startId,
    targetId: scenario.targetId,
    distances,
    previous,
    lockedOrder: [],
    validLocks: 0,
    invalidLocks: 0,
    status: "playing"
  };
}

function getDijkstraMinFrontierCandidates(session: DijkstraSessionDoc): string[] {
  const locked = new Set(session.lockedOrder);
  let minDistance = Number.POSITIVE_INFINITY;
  const candidates: string[] = [];
  for (const node of session.graph.nodes) {
    if (locked.has(node)) continue;
    const distance = session.distances[node];
    if (!Number.isFinite(distance)) continue;
    if (distance < minDistance) {
      minDistance = distance;
      candidates.length = 0;
      candidates.push(node);
    } else if (distance === minDistance) {
      candidates.push(node);
    }
  }
  return candidates.sort((a, b) => a.localeCompare(b));
}

function applyDijkstraLock(
  session: DijkstraSessionDoc,
  nodeId: string
): {
  accepted: boolean;
  reason: "ok" | "unknown-node" | "already-locked" | "not-frontier-min";
  candidateMinNodes: string[];
  next: DijkstraSessionDoc;
} {
  const next: DijkstraSessionDoc = {
    ...session,
    graph: cloneDijkstraGraph(session.graph),
    distances: { ...session.distances },
    previous: { ...session.previous },
    lockedOrder: [...session.lockedOrder]
  };

  if (!next.graph.nodes.includes(nodeId)) {
    return {
      accepted: false,
      reason: "unknown-node",
      candidateMinNodes: getDijkstraMinFrontierCandidates(next),
      next
    };
  }

  if (next.lockedOrder.includes(nodeId)) {
    return {
      accepted: false,
      reason: "already-locked",
      candidateMinNodes: getDijkstraMinFrontierCandidates(next),
      next
    };
  }

  const minCandidates = getDijkstraMinFrontierCandidates(next);
  if (!minCandidates.includes(nodeId)) {
    return {
      accepted: false,
      reason: "not-frontier-min",
      candidateMinNodes: minCandidates,
      next
    };
  }

  next.lockedOrder.push(nodeId);
  next.validLocks += 1;

  const locked = new Set(next.lockedOrder);
  const currentDistance = next.distances[nodeId];
  if (Number.isFinite(currentDistance)) {
    for (const edge of next.graph.adjacency[nodeId] ?? []) {
      if (locked.has(edge.to)) continue;
      const candidate = currentDistance + edge.weight;
      if (candidate < next.distances[edge.to]) {
        next.distances[edge.to] = candidate;
        next.previous[edge.to] = nodeId;
      }
    }
  }

  return {
    accepted: true,
    reason: "ok",
    candidateMinNodes: minCandidates,
    next
  };
}

function solveDijkstraGraph(graph: DijkstraGraph, startId: string): { distances: Record<string, number> } {
  const distances: Record<string, number> = {};
  const visited = new Set<string>();
  for (const node of graph.nodes) distances[node] = Number.POSITIVE_INFINITY;
  distances[startId] = 0;

  while (true) {
    let minNode: string | null = null;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const node of graph.nodes) {
      if (visited.has(node)) continue;
      if (distances[node] < minDistance) {
        minDistance = distances[node];
        minNode = node;
      }
    }
    if (!minNode || !Number.isFinite(minDistance)) break;
    visited.add(minNode);
    for (const edge of graph.adjacency[minNode] ?? []) {
      if (visited.has(edge.to)) continue;
      const candidate = distances[minNode] + edge.weight;
      if (candidate < distances[edge.to]) distances[edge.to] = candidate;
    }
  }

  return { distances };
}

const KNAPSACK_ROUND_POOL: Array<{ capacity: number; items: KnapsackItem[] }> = [
  {
    capacity: 14,
    items: [
      { id: "ruby-idol", weight: 3, value: 9 },
      { id: "silver-map", weight: 4, value: 8 },
      { id: "gold-mask", weight: 6, value: 13 },
      { id: "ancient-ring", weight: 2, value: 6 },
      { id: "jade-coin", weight: 5, value: 10 },
      { id: "obsidian-key", weight: 7, value: 14 }
    ]
  },
  {
    capacity: 10,
    items: [
      { id: "amber-orb", weight: 1, value: 3 },
      { id: "pirate-compass", weight: 3, value: 7 },
      { id: "crystal-skull", weight: 4, value: 8 },
      { id: "emerald-crown", weight: 6, value: 12 },
      { id: "bronze-scroll", weight: 5, value: 9 }
    ]
  }
];

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleItems(items: KnapsackItem[], randomFn: () => number): KnapsackItem[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pickKnapsackRound(randomFn: () => number = Math.random): { capacity: number; items: KnapsackItem[] } {
  const selected = KNAPSACK_ROUND_POOL[Math.floor(randomFn() * KNAPSACK_ROUND_POOL.length)];
  return {
    capacity: selected.capacity,
    items: selected.items.map((item) => ({ ...item }))
  };
}

function applyKnapsackMode(
  round: { capacity: number; items: KnapsackItem[] },
  mode: KnapsackMode,
  randomFn: () => number
): { capacity: number; items: KnapsackItem[] } {
  if (mode !== "challenge") {
    return { capacity: round.capacity, items: shuffleItems(round.items, randomFn) };
  }

  const distractors: KnapsackItem[] = [
    { id: "lead-statue", weight: 8, value: 3 },
    { id: "rusted-anchor", weight: 9, value: 2 },
    { id: "broken-totem", weight: 7, value: 3 },
    { id: "cracked-vault", weight: 10, value: 4 }
  ];
  const first = Math.floor(randomFn() * distractors.length);
  const second = (first + 1 + Math.floor(randomFn() * (distractors.length - 1))) % distractors.length;
  const items = shuffleItems([...round.items, distractors[first], distractors[second]], randomFn);
  return { capacity: round.capacity, items };
}

function solveKnapsackOptimal(items: KnapsackItem[], capacity: number): number {
  const dp = Array.from({ length: capacity + 1 }, () => 0);
  for (const item of items) {
    for (let w = capacity; w >= item.weight; w -= 1) {
      dp[w] = Math.max(dp[w], dp[w - item.weight] + item.value);
    }
  }
  return dp[capacity];
}

function randomUniqueArray(size: number): number[] {
  const values = new Set<number>();
  while (values.size < size) {
    values.add(Math.floor(Math.random() * 99) + 1);
  }
  return Array.from(values);
}

function splitBalanceScore(leftCount: number, rightCount: number): number {
  if (leftCount + rightCount === 0) return 1;
  const total = leftCount + rightCount;
  const imbalance = Math.abs(leftCount - rightCount) / total;
  return 1 - imbalance;
}

function optimalAttempts(rangeMin: number, rangeMax: number): number {
  return Math.ceil(Math.log2(rangeMax - rangeMin + 1));
}

export const healthcheck = onCall(() => ({ ok: true, service: "seekv8-functions" }));

export const startSession = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const rangeMin = parseIntParam(request.data?.rangeMin, "rangeMin");
  const rangeMax = parseIntParam(request.data?.rangeMax, "rangeMax");

  if (rangeMin >= rangeMax) {
    throw new HttpsError("invalid-argument", "rangeMin must be less than rangeMax.");
  }

  if (rangeMin < 1 || rangeMax > 100000) {
    throw new HttpsError("invalid-argument", "Range is out of allowed limits.");
  }

  const target = Math.floor(Math.random() * (rangeMax - rangeMin + 1)) + rangeMin;
  const nowMs = Date.now();
  const secretExpiresAt = Timestamp.fromMillis(nowMs + SESSION_SECRET_TTL_MS);
  const sessionExpiresAt = Timestamp.fromMillis(nowMs + SESSION_TTL_MS);
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc();
  const secretRef = db.collection("sessionSecrets").doc(sessionRef.id);
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(sessionRef, {
      gameId: BINARY_GAME_ID,
      rangeMin,
      rangeMax,
      attempts: 0,
      status: "playing",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      expiresAt: sessionExpiresAt
    });

    tx.set(secretRef, {
      uid,
      target,
      gameId: BINARY_GAME_ID,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: secretExpiresAt
    });
  });

  return { sessionId: sessionRef.id };
});

export const submitGuess = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sessionId = request.data?.sessionId;
  const guess = parseIntParam(request.data?.guess, "guess");

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }

  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
  const secretRef = db.collection("sessionSecrets").doc(sessionId);
  const bestRef = db.collection("users").doc(uid).collection("bestScores").doc(BINARY_GAME_ID);
  const leaderboardRef = db.collection("leaderboards").doc(BINARY_GAME_ID).collection("entries").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [sessionSnap, secretSnap, bestSnap, leaderboardSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(secretRef),
      tx.get(bestRef),
      tx.get(leaderboardRef)
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }

    if (!secretSnap.exists) {
      throw new HttpsError("failed-precondition", "Session secret not found.");
    }

    const session = sessionSnap.data() as SessionDoc;
    const secret = secretSnap.data() as { uid: string; target: number; gameId: string };

    if (session.gameId !== BINARY_GAME_ID || secret.gameId !== BINARY_GAME_ID) {
      throw new HttpsError("failed-precondition", "Session type mismatch.");
    }

    if (secret.uid !== uid) {
      throw new HttpsError("permission-denied", "Session does not belong to current user.");
    }

    if (session.status !== "playing") {
      throw new HttpsError("failed-precondition", "Session is already finished.");
    }

    const rangeMin = session.rangeMin;
    const rangeMax = session.rangeMax;
    if (guess < rangeMin || guess > rangeMax) {
      throw new HttpsError("invalid-argument", `Guess must be between ${rangeMin} and ${rangeMax}.`);
    }

    const attempts = session.attempts + 1;
    const target = secret.target;
    const now = FieldValue.serverTimestamp();

    if (guess < target) {
      tx.update(sessionRef, {
        attempts,
        lastGuess: guess,
        feedback: "too-low",
        updatedAt: now
      });
      return { outcome: "too-low", attempts, status: "playing" as const };
    }

    if (guess > target) {
      tx.update(sessionRef, {
        attempts,
        lastGuess: guess,
        feedback: "too-high",
        updatedAt: now
      });
      return { outcome: "too-high", attempts, status: "playing" as const };
    }

    const optimal = optimalAttempts(rangeMin, rangeMax);
    const delta = attempts - optimal;

    tx.update(sessionRef, {
      attempts,
      lastGuess: guess,
      feedback: "correct",
      status: "won",
      target,
      optimalAttempts: optimal,
      delta,
      endedAt: now,
      updatedAt: now
    });

    tx.delete(secretRef);

    const best = bestSnap.exists
      ? (bestSnap.data() as { bestAttempts: number; delta: number })
      : null;
    const bestImproved =
      !best || attempts < best.bestAttempts || (attempts === best.bestAttempts && delta < best.delta);

    if (bestImproved) {
      tx.set(
        bestRef,
        {
          gameId: BINARY_GAME_ID,
          bestAttempts: attempts,
          optimalAttempts: optimal,
          delta,
          updatedAt: now
        },
        { merge: true }
      );

      const board = leaderboardSnap.exists
        ? (leaderboardSnap.data() as { bestAttempts: number; delta: number })
        : null;
      const boardImproved =
        !board ||
        attempts < board.bestAttempts ||
        (attempts === board.bestAttempts && delta < board.delta);

      if (boardImproved) {
        tx.set(
          leaderboardRef,
          {
            uid,
            bestAttempts: attempts,
            delta,
            updatedAt: now
          },
          { merge: true }
        );
      }
    }

    return {
      outcome: "correct",
      attempts,
      status: "won" as const,
      target,
      optimalAttempts: optimal,
      delta,
      bestUpdated: bestImproved
    };
  });

  return result;
});

export const getLeaderboard = onCall(async (request) => {
  const gameId = ensureSupportedGameId(request.data?.gameId);
  const limitRaw = request.data?.limit;
  const limit = typeof limitRaw === "number" && Number.isInteger(limitRaw) ? limitRaw : 10;
  const clampedLimit = Math.max(1, Math.min(limit, 50));
  const metricField =
    gameId === BINARY_GAME_ID
      ? "bestAttempts"
      : gameId === RANGE_GAME_ID
        ? "bestSelections"
        : gameId === QUICK_SORT_GAME_ID || gameId === DIJKSTRA_GAME_ID
          ? "bestCost"
          : "bestDelta";

  const snap = await db
    .collection("leaderboards")
    .doc(gameId)
    .collection("entries")
    .orderBy(metricField, "asc")
    .limit(clampedLimit)
    .get();

  const entries = snap.docs
    .map((doc) => {
      const data = doc.data() as {
        uid: string;
        bestAttempts?: number;
        bestSelections?: number;
        bestCost?: number;
        bestDelta?: number;
        delta: number;
      };
      return {
        uid: data.uid ?? doc.id,
        bestAttempts: data.bestAttempts,
        bestSelections: data.bestSelections,
        bestCost: data.bestCost,
        bestDelta: data.bestDelta,
        delta: data.delta
      };
    })
    .sort((a, b) => {
      const aMetric =
        gameId === BINARY_GAME_ID
          ? (a.bestAttempts ?? Number.MAX_SAFE_INTEGER)
          : gameId === RANGE_GAME_ID
            ? (a.bestSelections ?? Number.MAX_SAFE_INTEGER)
            : gameId === QUICK_SORT_GAME_ID || gameId === DIJKSTRA_GAME_ID
              ? (a.bestCost ?? Number.MAX_SAFE_INTEGER)
              : (a.bestDelta ?? Number.MAX_SAFE_INTEGER);
      const bMetric =
        gameId === BINARY_GAME_ID
          ? (b.bestAttempts ?? Number.MAX_SAFE_INTEGER)
          : gameId === RANGE_GAME_ID
            ? (b.bestSelections ?? Number.MAX_SAFE_INTEGER)
            : gameId === QUICK_SORT_GAME_ID || gameId === DIJKSTRA_GAME_ID
              ? (b.bestCost ?? Number.MAX_SAFE_INTEGER)
              : (b.bestDelta ?? Number.MAX_SAFE_INTEGER);
      return aMetric - bMetric || a.delta - b.delta;
    });

  return { entries };
});

export const startRangeSession = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const rangeMin = parseIntParam(request.data?.rangeMin, "rangeMin");
  const rangeMax = parseIntParam(request.data?.rangeMax, "rangeMax");

  if (rangeMin >= rangeMax) {
    throw new HttpsError("invalid-argument", "rangeMin must be less than rangeMax.");
  }

  if (rangeMin < 1 || rangeMax > 100000) {
    throw new HttpsError("invalid-argument", "Range is out of allowed limits.");
  }

  const target = Math.floor(Math.random() * (rangeMax - rangeMin + 1)) + rangeMin;
  const nowMs = Date.now();
  const secretExpiresAt = Timestamp.fromMillis(nowMs + SESSION_SECRET_TTL_MS);
  const sessionExpiresAt = Timestamp.fromMillis(nowMs + SESSION_TTL_MS);
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc();
  const secretRef = db.collection("sessionSecrets").doc(sessionRef.id);
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(sessionRef, {
      gameId: RANGE_GAME_ID,
      rangeMin,
      rangeMax,
      currentMin: rangeMin,
      currentMax: rangeMax,
      selections: 0,
      status: "playing",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      expiresAt: sessionExpiresAt
    });

    tx.set(secretRef, {
      uid,
      target,
      gameId: RANGE_GAME_ID,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: secretExpiresAt
    });
  });

  return {
    sessionId: sessionRef.id,
    currentMin: rangeMin,
    currentMax: rangeMax
  };
});

export const submitRangeSelection = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sessionId = request.data?.sessionId;
  const selected = request.data?.selected;
  const splitPointRaw = request.data?.splitPoint;

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }

  if (selected !== "left" && selected !== "right") {
    throw new HttpsError("invalid-argument", "selected must be either 'left' or 'right'.");
  }

  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
  const secretRef = db.collection("sessionSecrets").doc(sessionId);
  const bestRef = db.collection("users").doc(uid).collection("bestScores").doc(RANGE_GAME_ID);
  const leaderboardRef = db.collection("leaderboards").doc(RANGE_GAME_ID).collection("entries").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [sessionSnap, secretSnap, bestSnap, leaderboardSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(secretRef),
      tx.get(bestRef),
      tx.get(leaderboardRef)
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }

    if (!secretSnap.exists) {
      throw new HttpsError("failed-precondition", "Session secret not found.");
    }

    const session = sessionSnap.data() as RangeSessionDoc;
    const secret = secretSnap.data() as { uid: string; target: number; gameId: string };

    if (session.gameId !== RANGE_GAME_ID || secret.gameId !== RANGE_GAME_ID) {
      throw new HttpsError("failed-precondition", "Session type mismatch.");
    }

    if (secret.uid !== uid) {
      throw new HttpsError("permission-denied", "Session does not belong to current user.");
    }

    if (session.status !== "playing") {
      throw new HttpsError("failed-precondition", "Session is already finished.");
    }

    if (session.currentMin >= session.currentMax) {
      throw new HttpsError("failed-precondition", "Session interval can no longer be split.");
    }

    let midpoint = toMidpoint(session.currentMin, session.currentMax);
    if (splitPointRaw !== undefined && splitPointRaw !== null) {
      const splitPoint = parseIntParam(splitPointRaw, "splitPoint");
      if (splitPoint < session.currentMin || splitPoint >= session.currentMax) {
        throw new HttpsError(
          "invalid-argument",
          `splitPoint must be between ${session.currentMin} and ${session.currentMax - 1}.`
        );
      }
      midpoint = splitPoint;
    }

    const leftMin = session.currentMin;
    const leftMax = midpoint;
    const rightMin = midpoint + 1;
    const rightMax = session.currentMax;

    const selectedMin = selected === "left" ? leftMin : rightMin;
    const selectedMax = selected === "left" ? leftMax : rightMax;
    const complementMin = selected === "left" ? rightMin : leftMin;
    const complementMax = selected === "left" ? rightMax : leftMax;

    const target = secret.target;
    const isInside = target >= selectedMin && target <= selectedMax;
    const nextMin = isInside ? selectedMin : complementMin;
    const nextMax = isInside ? selectedMax : complementMax;
    const leftSize = leftMax - leftMin + 1;
    const rightSize = rightMax - rightMin + 1;
    const totalSize = session.currentMax - session.currentMin + 1;
    const largerRatio = Math.max(leftSize, rightSize) / totalSize;
    const penalty = largerRatio > 0.75 ? 1 : 0;
    const selections = session.selections + 1 + penalty;
    const now = FieldValue.serverTimestamp();

    if (nextMin === nextMax) {
      const optimal = optimalAttempts(session.rangeMin, session.rangeMax);
      const delta = selections - optimal;
      const best = bestSnap.exists
        ? (bestSnap.data() as { bestSelections: number; delta: number })
        : null;
      const bestImproved =
        !best ||
        selections < best.bestSelections ||
        (selections === best.bestSelections && delta < best.delta);

      tx.update(sessionRef, {
        currentMin: nextMin,
        currentMax: nextMax,
        selections,
        penaltyApplied: penalty,
        feedback: "correct",
        status: "won",
        target,
        optimalSelections: optimal,
        delta,
        endedAt: now,
        updatedAt: now
      });

      tx.delete(secretRef);

      if (bestImproved) {
        tx.set(
          bestRef,
          {
            gameId: RANGE_GAME_ID,
            bestSelections: selections,
            optimalSelections: optimal,
            delta,
            updatedAt: now
          },
          { merge: true }
        );

        const board = leaderboardSnap.exists
          ? (leaderboardSnap.data() as { bestSelections: number; delta: number })
          : null;
        const boardImproved =
          !board ||
          selections < board.bestSelections ||
          (selections === board.bestSelections && delta < board.delta);

        if (boardImproved) {
          tx.set(
            leaderboardRef,
            {
              uid,
              bestSelections: selections,
              delta,
              updatedAt: now
            },
            { merge: true }
          );
        }
      }

      return {
        outcome: "correct",
        status: "won" as const,
        selections,
        penaltyApplied: penalty,
        currentMin: nextMin,
        currentMax: nextMax,
        target,
        optimalSelections: optimal,
        delta,
        bestUpdated: bestImproved
      };
    }

    const feedback = isInside ? "inside-selected-range" : "not-inside-selected-range";
    tx.update(sessionRef, {
      currentMin: nextMin,
      currentMax: nextMax,
      selections,
      lastSelection: selected,
      splitPoint: midpoint,
      penaltyApplied: penalty,
      feedback,
      updatedAt: now
    });

    return {
      outcome: feedback,
      status: "playing" as const,
      selections,
      penaltyApplied: penalty,
      currentMin: nextMin,
      currentMax: nextMax
    };
  });

  return result;
});

export const startQuickSortSession = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sizeRaw = request.data?.size;
  const size =
    typeof sizeRaw === "number" && Number.isInteger(sizeRaw) ? sizeRaw : 8;

  if (size < 4 || size > 20) {
    throw new HttpsError("invalid-argument", "size must be between 4 and 20.");
  }

  const array = randomUniqueArray(size);
  const nowMs = Date.now();
  const sessionExpiresAt = Timestamp.fromMillis(nowMs + SESSION_TTL_MS);
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc();
  const userRef = db.collection("users").doc(uid);
  const stack: QuickSortRange[] = size > 1 ? [{ low: 0, high: size - 1 }] : [];

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(sessionRef, {
      gameId: QUICK_SORT_GAME_ID,
      array,
      stack,
      roundsCompleted: 0,
      invalidSubmits: 0,
      moves: 0,
      status: stack.length === 0 ? "won" : "playing",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      expiresAt: sessionExpiresAt
    });
  });

  return {
    sessionId: sessionRef.id,
    array,
    stack,
    roundsCompleted: 0,
    invalidSubmits: 0,
    moves: 0,
    status: stack.length === 0 ? "won" : "playing"
  };
});

export const submitQuickSortPartition = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sessionId = request.data?.sessionId;
  const pivotIndex = parseIntParam(request.data?.pivotIndex, "pivotIndex");
  const leftIndices = Array.isArray(request.data?.leftIndices)
    ? (request.data.leftIndices as unknown[])
    : null;
  const rightIndices = Array.isArray(request.data?.rightIndices)
    ? (request.data.rightIndices as unknown[])
    : null;
  const moveDeltaRaw = request.data?.moveDelta;
  const moveDelta =
    typeof moveDeltaRaw === "number" && Number.isInteger(moveDeltaRaw) && moveDeltaRaw >= 0
      ? moveDeltaRaw
      : 0;

  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }
  if (!leftIndices || !rightIndices) {
    throw new HttpsError("invalid-argument", "leftIndices and rightIndices are required arrays.");
  }
  if (leftIndices.length > 1000 || rightIndices.length > 1000) {
    throw new HttpsError("invalid-argument", "Partition payload is too large.");
  }
  if (moveDelta > 5000) {
    throw new HttpsError("invalid-argument", "moveDelta is too large.");
  }

  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
  const bestRef = db.collection("users").doc(uid).collection("bestScores").doc(QUICK_SORT_GAME_ID);
  const leaderboardRef = db.collection("leaderboards").doc(QUICK_SORT_GAME_ID).collection("entries").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [sessionSnap, bestSnap, leaderboardSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(bestRef),
      tx.get(leaderboardRef)
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }

    const session = sessionSnap.data() as QuickSortSessionDoc;
    if (session.gameId !== QUICK_SORT_GAME_ID) {
      throw new HttpsError("failed-precondition", "Session type mismatch.");
    }
    if (session.status !== "playing") {
      throw new HttpsError("failed-precondition", "Session is already finished.");
    }
    if (!Array.isArray(session.array) || !Array.isArray(session.stack) || session.stack.length === 0) {
      throw new HttpsError("failed-precondition", "Session state is invalid.");
    }

    const active = session.stack[session.stack.length - 1];
    if (!active || !Number.isInteger(active.low) || !Number.isInteger(active.high)) {
      throw new HttpsError("failed-precondition", "Active range is invalid.");
    }
    if (pivotIndex < active.low || pivotIndex > active.high) {
      throw new HttpsError("invalid-argument", "pivotIndex must be inside active range.");
    }

    const allSubmitted = [...leftIndices, ...rightIndices];
    const seen = new Set<number>();
    const duplicateIndices: number[] = [];
    const outOfRangeIndices: number[] = [];
    for (const raw of allSubmitted) {
      if (typeof raw !== "number" || !Number.isInteger(raw)) {
        outOfRangeIndices.push(-1);
        continue;
      }
      if (raw < active.low || raw > active.high || raw === pivotIndex) {
        outOfRangeIndices.push(raw);
        continue;
      }
      if (seen.has(raw)) {
        duplicateIndices.push(raw);
        continue;
      }
      seen.add(raw);
    }

    const missingIndices: number[] = [];
    for (let i = active.low; i <= active.high; i += 1) {
      if (i === pivotIndex) continue;
      if (!seen.has(i)) missingIndices.push(i);
    }

    const pivotValue = session.array[pivotIndex];
    const misplacedLeftIndices = leftIndices.filter(
      (i: unknown) =>
        typeof i === "number" &&
        Number.isInteger(i) &&
        i >= 0 &&
        i < session.array.length &&
        session.array[i] >= pivotValue
    ) as number[];
    const misplacedRightIndices = rightIndices.filter(
      (i: unknown) =>
        typeof i === "number" &&
        Number.isInteger(i) &&
        i >= 0 &&
        i < session.array.length &&
        session.array[i] < pivotValue
    ) as number[];

    const expectedCount = active.high - active.low;
    if (allSubmitted.length > expectedCount) {
      throw new HttpsError("invalid-argument", "Too many indices submitted for active range.");
    }
    const issueCount =
      duplicateIndices.length +
      outOfRangeIndices.length +
      missingIndices.length +
      misplacedLeftIndices.length +
      misplacedRightIndices.length;
    const accuracy = expectedCount === 0 ? 1 : Math.max(0, 1 - issueCount / expectedCount);
    const isValid = issueCount === 0 && allSubmitted.length === expectedCount;

    const now = FieldValue.serverTimestamp();
    const nextMoves = session.moves + moveDelta;

    if (!isValid) {
      tx.update(sessionRef, {
        moves: nextMoves,
        invalidSubmits: session.invalidSubmits + 1,
        updatedAt: now
      });
      return {
        accepted: false,
        accuracy,
        balanceScore: splitBalanceScore(leftIndices.length, rightIndices.length),
        invalidDetails: {
          missingIndices,
          duplicateIndices,
          outOfRangeIndices,
          misplacedLeftIndices,
          misplacedRightIndices
        },
        array: session.array,
        stack: session.stack,
        roundsCompleted: session.roundsCompleted,
        invalidSubmits: session.invalidSubmits + 1,
        moves: nextMoves,
        status: "playing" as const
      };
    }

    const leftValues = leftIndices.map((i: unknown) => session.array[i as number]);
    const rightValues = rightIndices.map((i: unknown) => session.array[i as number]);
    const nextArray = [...session.array];
    const arranged = [...leftValues, pivotValue, ...rightValues];
    for (let offset = 0; offset < arranged.length; offset += 1) {
      nextArray[active.low + offset] = arranged[offset];
    }

    const pivotFinal = active.low + leftValues.length;
    const leftRange: QuickSortRange = { low: active.low, high: pivotFinal - 1 };
    const rightRange: QuickSortRange = { low: pivotFinal + 1, high: active.high };
    const nextStack = session.stack.slice(0, -1);
    if (rightRange.low < rightRange.high) nextStack.push(rightRange);
    if (leftRange.low < leftRange.high) nextStack.push(leftRange);

    const roundsCompleted = session.roundsCompleted + 1;
    const isComplete = nextStack.length === 0;
    const totalCost = roundsCompleted + session.invalidSubmits + nextMoves;
    const baselineCost = Math.max(1, session.array.length - 1);
    const delta = totalCost - baselineCost;

    tx.update(sessionRef, {
      array: nextArray,
      stack: nextStack,
      roundsCompleted,
      moves: nextMoves,
      status: isComplete ? "won" : "playing",
      totalCost: isComplete ? totalCost : null,
      baselineCost: isComplete ? baselineCost : null,
      delta: isComplete ? delta : null,
      endedAt: isComplete ? now : null,
      updatedAt: now
    });

    let bestUpdated = false;
    if (isComplete) {
      const best = bestSnap.exists ? (bestSnap.data() as { bestCost: number; delta: number }) : null;
      const bestImproved = !best || totalCost < best.bestCost || (totalCost === best.bestCost && delta < best.delta);
      if (bestImproved) {
        bestUpdated = true;
        tx.set(
          bestRef,
          {
            gameId: QUICK_SORT_GAME_ID,
            bestCost: totalCost,
            roundsCompleted,
            invalidSubmits: session.invalidSubmits,
            moves: nextMoves,
            baselineCost,
            delta,
            updatedAt: now
          },
          { merge: true }
        );

        const board = leaderboardSnap.exists
          ? (leaderboardSnap.data() as { bestCost: number; delta: number })
          : null;
        const boardImproved = !board || totalCost < board.bestCost || (totalCost === board.bestCost && delta < board.delta);
        if (boardImproved) {
          tx.set(
            leaderboardRef,
            {
              uid,
              bestCost: totalCost,
              delta,
              updatedAt: now
            },
            { merge: true }
          );
        }
      }
    }

    return {
      accepted: true,
      accuracy,
      balanceScore: splitBalanceScore(leftIndices.length, rightIndices.length),
      invalidDetails: null,
      array: nextArray,
      stack: nextStack,
      roundsCompleted,
      invalidSubmits: session.invalidSubmits,
      moves: nextMoves,
      status: isComplete ? "won" : "playing",
      totalCost: isComplete ? totalCost : undefined,
      baselineCost: isComplete ? baselineCost : undefined,
      delta: isComplete ? delta : undefined,
      bestUpdated
    };
  });

  return result;
});

export const startDijkstraSession = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc();
  const userRef = db.collection("users").doc(uid);
  const nowMs = Date.now();
  const sessionExpiresAt = Timestamp.fromMillis(nowMs + SESSION_TTL_MS);
  const scenario = DIJKSTRA_SCENARIOS[Math.floor(Math.random() * DIJKSTRA_SCENARIOS.length)];
  const initial = createDijkstraInitialState(scenario);

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(sessionRef, {
      ...initial,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      expiresAt: sessionExpiresAt
    });
  });

  return {
    sessionId: sessionRef.id,
    scenarioId: initial.scenarioId,
    graph: initial.graph,
    startId: initial.startId,
    targetId: initial.targetId,
    distances: initial.distances,
    previous: initial.previous,
    lockedOrder: initial.lockedOrder,
    validLocks: initial.validLocks,
    invalidLocks: initial.invalidLocks,
    status: initial.status
  };
});

export const submitDijkstraLock = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sessionId = parseSessionId(request.data?.sessionId);
  const nodeId = parseDijkstraNodeId(request.data?.nodeId);

  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
  const bestRef = db.collection("users").doc(uid).collection("bestScores").doc(DIJKSTRA_GAME_ID);
  const leaderboardRef = db.collection("leaderboards").doc(DIJKSTRA_GAME_ID).collection("entries").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [sessionSnap, bestSnap, leaderboardSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(bestRef),
      tx.get(leaderboardRef)
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }

    const session = sessionSnap.data() as DijkstraSessionDoc;
    if (session.gameId !== DIJKSTRA_GAME_ID) {
      throw new HttpsError("failed-precondition", "Session type mismatch.");
    }
    if (session.status !== "playing") {
      throw new HttpsError("failed-precondition", "Session is already finished.");
    }
    if (session.expiresAt && session.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError("failed-precondition", "Session has expired.");
    }
    if (!session.graph || !Array.isArray(session.graph.nodes) || typeof session.startId !== "string") {
      throw new HttpsError("failed-precondition", "Session state is invalid.");
    }

    const applied = applyDijkstraLock(session, nodeId);
    const now = FieldValue.serverTimestamp();

    if (!applied.accepted) {
      tx.update(sessionRef, {
        invalidLocks: session.invalidLocks + 1,
        updatedAt: now
      });
      return {
        accepted: false,
        reason: applied.reason,
        candidateMinNodes: applied.candidateMinNodes,
        scenarioId: session.scenarioId,
        graph: session.graph,
        startId: session.startId,
        targetId: session.targetId,
        distances: session.distances,
        previous: session.previous,
        lockedOrder: session.lockedOrder,
        validLocks: session.validLocks,
        invalidLocks: session.invalidLocks + 1,
        status: "playing" as const
      };
    }

    const next = applied.next;
    const isComplete = nodeId === session.targetId;
    const solved = solveDijkstraGraph(session.graph, session.startId);
    const targetDistance = next.distances[session.targetId];
    const optimalDistance = solved.distances[session.targetId];
    const delta =
      Number.isFinite(targetDistance) && Number.isFinite(optimalDistance)
        ? Math.max(0, targetDistance - optimalDistance)
        : 0;
    const bestCost = delta * 10 + next.invalidLocks;

    tx.update(sessionRef, {
      distances: next.distances,
      previous: next.previous,
      lockedOrder: next.lockedOrder,
      validLocks: next.validLocks,
      invalidLocks: next.invalidLocks,
      status: isComplete ? "won" : "playing",
      targetDistance: isComplete ? targetDistance : null,
      optimalDistance: isComplete ? optimalDistance : null,
      delta: isComplete ? delta : null,
      bestCost: isComplete ? bestCost : null,
      endedAt: isComplete ? now : null,
      updatedAt: now
    });

    let improved = false;
    if (isComplete) {
      const best = bestSnap.exists ? (bestSnap.data() as { bestCost: number; delta: number }) : null;
      const bestImproved = !best || bestCost < best.bestCost || (bestCost === best.bestCost && delta < best.delta);
      if (bestImproved) {
        improved = true;
        tx.set(
          bestRef,
          {
            gameId: DIJKSTRA_GAME_ID,
            bestCost,
            delta,
            targetDistance,
            optimalDistance,
            validLocks: next.validLocks,
            invalidLocks: next.invalidLocks,
            updatedAt: now
          },
          { merge: true }
        );

        const board = leaderboardSnap.exists ? (leaderboardSnap.data() as { bestCost: number; delta: number }) : null;
        const boardImproved = !board || bestCost < board.bestCost || (bestCost === board.bestCost && delta < board.delta);
        if (boardImproved) {
          tx.set(
            leaderboardRef,
            {
              uid,
              bestCost,
              delta,
              updatedAt: now
            },
            { merge: true }
          );
        }
      }
    }

    return {
      accepted: true,
      reason: "ok" as const,
      candidateMinNodes: applied.candidateMinNodes,
      scenarioId: next.scenarioId,
      graph: next.graph,
      startId: next.startId,
      targetId: next.targetId,
      distances: next.distances,
      previous: next.previous,
      lockedOrder: next.lockedOrder,
      validLocks: next.validLocks,
      invalidLocks: next.invalidLocks,
      status: isComplete ? "won" as const : "playing" as const,
      targetDistance: isComplete ? targetDistance : undefined,
      optimalDistance: isComplete ? optimalDistance : undefined,
      delta: isComplete ? delta : undefined,
      bestCost: isComplete ? bestCost : undefined,
      bestUpdated: improved
    };
  });

  return result;
});

export const startKnapsackSession = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const mode = parseKnapsackMode(request.data?.mode);
  const dailyKey = parseDailyKey(request.data?.dailyKey);
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc();
  const userRef = db.collection("users").doc(uid);
  const nowMs = Date.now();
  const sessionExpiresAt = Timestamp.fromMillis(nowMs + SESSION_TTL_MS);
  const randomFn = dailyKey ? mulberry32(hashString(`${dailyKey}:${mode}`)) : Math.random;
  const baseRound = pickKnapsackRound(randomFn);
  const round = applyKnapsackMode(baseRound, mode, randomFn);

  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(sessionRef, {
      gameId: KNAPSACK_GAME_ID,
      capacity: round.capacity,
      items: round.items,
      submitAttempts: 0,
      mode,
      dailyKey,
      status: "playing",
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      expiresAt: sessionExpiresAt
    });
  });

  return {
    sessionId: sessionRef.id,
    capacity: round.capacity,
    items: round.items,
    submitAttempts: 0,
    mode,
    dailyKey,
    status: "playing" as const
  };
});

export const submitKnapsackSelection = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const sessionId = parseSessionId(request.data?.sessionId);
  const selectedIndices = parseSelectedIndices(request.data?.selectedIndices);

  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
  const bestRef = db.collection("users").doc(uid).collection("bestScores").doc(KNAPSACK_GAME_ID);
  const leaderboardRef = db.collection("leaderboards").doc(KNAPSACK_GAME_ID).collection("entries").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [sessionSnap, bestSnap, leaderboardSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(bestRef),
      tx.get(leaderboardRef)
    ]);

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }

    const session = sessionSnap.data() as KnapsackSessionDoc;
    if (session.gameId !== KNAPSACK_GAME_ID) {
      throw new HttpsError("failed-precondition", "Session type mismatch.");
    }
    if (session.status !== "playing") {
      throw new HttpsError("failed-precondition", "Session is already finished.");
    }
    if (!Array.isArray(session.items) || !Number.isInteger(session.capacity) || session.capacity < 0) {
      throw new HttpsError("failed-precondition", "Session state is invalid.");
    }

    const seen = new Set<number>();
    const duplicateIndices: number[] = [];
    const outOfRangeIndices: number[] = [];
    let usedWeight = 0;
    let selectedValue = 0;

    for (const idx of selectedIndices) {
      if (idx < 0 || idx >= session.items.length) {
        outOfRangeIndices.push(idx);
        continue;
      }
      if (seen.has(idx)) {
        duplicateIndices.push(idx);
        continue;
      }
      seen.add(idx);
      usedWeight += session.items[idx].weight;
      selectedValue += session.items[idx].value;
    }

    const overweightBy = Math.max(0, usedWeight - session.capacity);
    const isValid = duplicateIndices.length === 0 && outOfRangeIndices.length === 0 && overweightBy === 0;
    const submitAttempts = session.submitAttempts + 1;
    const optimalValue = solveKnapsackOptimal(session.items, session.capacity);
    const delta = optimalValue - selectedValue;
    const efficiency = optimalValue === 0 ? 1 : selectedValue / optimalValue;
    const now = FieldValue.serverTimestamp();

    if (!isValid) {
      tx.update(sessionRef, {
        submitAttempts,
        updatedAt: now
      });

      return {
        status: "playing" as const,
        mode: session.mode ?? "learn",
        dailyKey: session.dailyKey ?? null,
        submitAttempts,
        isValid: false,
        usedWeight,
        selectedValue,
        selectedCount: seen.size,
        overweightBy,
        duplicateIndices,
        outOfRangeIndices,
        optimalValue,
        efficiency,
        delta
      };
    }

    tx.update(sessionRef, {
      submitAttempts,
      status: "won",
      selectedIndices: Array.from(seen.values()).sort((a, b) => a - b),
      selectedValue,
      usedWeight,
      selectedCount: seen.size,
      optimalValue,
      efficiency,
      delta,
      endedAt: now,
      updatedAt: now
    });

    const best = bestSnap.exists
      ? (bestSnap.data() as { bestDelta: number; selectedValue: number })
      : null;
    const bestImproved =
      !best || delta < best.bestDelta || (delta === best.bestDelta && selectedValue > best.selectedValue);

    if (bestImproved) {
      tx.set(
        bestRef,
        {
          gameId: KNAPSACK_GAME_ID,
          mode: session.mode ?? "learn",
          bestDelta: delta,
          selectedValue,
          optimalValue,
          efficiency,
          usedWeight,
          capacity: session.capacity,
          updatedAt: now
        },
        { merge: true }
      );

      const board = leaderboardSnap.exists
        ? (leaderboardSnap.data() as { bestDelta: number; selectedValue: number })
        : null;
      const boardImproved =
        !board || delta < board.bestDelta || (delta === board.bestDelta && selectedValue > board.selectedValue);

      if (boardImproved) {
        tx.set(
          leaderboardRef,
          {
            uid,
            mode: session.mode ?? "learn",
            bestDelta: delta,
            selectedValue,
            delta,
            updatedAt: now
          },
          { merge: true }
        );
      }
    }

    return {
      status: "won" as const,
      mode: session.mode ?? "learn",
      dailyKey: session.dailyKey ?? null,
      submitAttempts,
      isValid: true,
      usedWeight,
      selectedValue,
      selectedCount: seen.size,
      overweightBy: 0,
      duplicateIndices: [],
      outOfRangeIndices: [],
      optimalValue,
      efficiency,
      delta,
      bestUpdated: bestImproved
    };
  });

  return result;
});
