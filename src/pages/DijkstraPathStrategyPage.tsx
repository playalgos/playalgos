import { useEffect, useMemo, useState } from "react";
import { buildShortestPath, DIJKSTRA_PATH_STRATEGY_GAME_ID, type WeightedGraph } from "../games/dijkstraPathStrategy";
import { auth } from "../firebase/client";
import {
  getDijkstraBestScore,
  getDijkstraLeaderboard,
  startDijkstraSession,
  submitDijkstraLock
} from "../firebase/dijkstraPathStrategyStore";

type GameState = "idle" | "playing" | "won";
type FeedbackTone = "neutral" | "outside" | "correct" | "inside";

type DijkstraViewState = {
  scenarioId: string;
  graph: WeightedGraph;
  startId: string;
  targetId: string;
  distances: Record<string, number>;
  previous: Record<string, string | null>;
  lockedOrder: string[];
  validLocks: number;
  invalidLocks: number;
};

function getDistanceLabel(value: number): string {
  return Number.isFinite(value) ? String(value) : "∞";
}

function getPathLabel(path: string[] | null): string {
  if (!path || path.length === 0) return "No path";
  return path.join(" -> ");
}

function getMinFrontierNodes(state: DijkstraViewState): string[] {
  const locked = new Set(state.lockedOrder);
  let min = Number.POSITIVE_INFINITY;
  const nodes: string[] = [];
  for (const node of state.graph.nodes) {
    if (locked.has(node)) continue;
    const distance = state.distances[node];
    if (!Number.isFinite(distance)) continue;
    if (distance < min) {
      min = distance;
      nodes.length = 0;
      nodes.push(node);
    } else if (distance === min) {
      nodes.push(node);
    }
  }
  return nodes.sort((a, b) => a.localeCompare(b));
}

export function DijkstraPathStrategyPage() {
  const uid = auth?.currentUser?.uid ?? null;
  const [gameState, setGameState] = useState<GameState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<DijkstraViewState | null>(null);
  const [feedback, setFeedback] = useState<string>("Start game to begin path strategy.");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [decisionLog, setDecisionLog] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string>("");
  const [bestCost, setBestCost] = useState<number | null>(null);
  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestCost: number; delta: number }>>([]);
  const [roundSummary, setRoundSummary] = useState<{
    targetDistance: number;
    optimalDistance: number;
    delta: number;
    bestCost: number;
  } | null>(null);

  const targetDistance =
    roundSummary?.targetDistance ?? (state ? state.distances[state.targetId] : Number.POSITIVE_INFINITY);
  const optimalDistance = roundSummary?.optimalDistance ?? Number.POSITIVE_INFINITY;
  const delta = roundSummary?.delta ?? 0;
  const playerPath = state ? buildShortestPath(state.previous, state.startId, state.targetId) : null;

  useEffect(() => {
    if (!uid) return;
    void (async () => {
      try {
        const best = await getDijkstraBestScore(uid);
        if (best) {
          setBestCost(best.bestCost);
          setBestDelta(best.delta);
        }
      } catch {
        // Keep page playable.
      }
    })();
  }, [uid]);

  useEffect(() => {
    void (async () => {
      try {
        setLeaderboard(await getDijkstraLeaderboard(5));
      } catch {
        setLeaderboard([]);
      }
    })();
  }, []);

  async function beginGame(): Promise<void> {
    setInputError("");
    setRoundSummary(null);
    setHintsUsed(0);
    setShowHint(false);
    setDecisionLog([]);
    setFeedback("Loading scenario...");
    setFeedbackTone("neutral");

    try {
      const session = await startDijkstraSession();
      if (!session) {
        setInputError("Could not start dijkstra session.");
        setGameState("idle");
        return;
      }

      setSessionId(session.sessionId);
      setState({
        scenarioId: session.scenarioId,
        graph: session.graph,
        startId: session.startId,
        targetId: session.targetId,
        distances: session.distances,
        previous: session.previous,
        lockedOrder: session.lockedOrder,
        validLocks: session.validLocks,
        invalidLocks: session.invalidLocks
      });
      setFeedback(`Game started. Lock frontier nodes from ${session.startId} toward ${session.targetId}.`);
      setFeedbackTone("neutral");
      setGameState("playing");
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not start dijkstra session.");
      setGameState("idle");
    }
  }

  function useHint(): void {
    if (!state || gameState !== "playing") return;
    setHintsUsed((value) => value + 1);
    setShowHint(true);
    const minNodes = getMinFrontierNodes(state);
    setFeedback(
      minNodes.length === 0
        ? "Hint: no reachable frontier nodes remain."
        : `Hint: minimum frontier node(s): ${minNodes.join(", ")}`
    );
    setFeedbackTone("inside");
  }

  async function lockNode(nodeId: string): Promise<void> {
    if (!state || !sessionId || gameState !== "playing") return;
    setInputError("");
    setShowHint(false);

    try {
      const result = await submitDijkstraLock({ sessionId, nodeId });
      const nextState: DijkstraViewState = {
        scenarioId: result.scenarioId,
        graph: result.graph,
        startId: result.startId,
        targetId: result.targetId,
        distances: result.distances,
        previous: result.previous,
        lockedOrder: result.lockedOrder,
        validLocks: result.validLocks,
        invalidLocks: result.invalidLocks
      };
      setState(nextState);

      if (!result.accepted) {
        setFeedback(
          result.candidateMinNodes.length === 0
            ? `Invalid lock for ${nodeId}. No reachable frontier node available.`
            : `Invalid lock for ${nodeId}. Minimum frontier node(s): ${result.candidateMinNodes.join(", ")}`
        );
        setFeedbackTone("outside");
        setDecisionLog((logs) => [`Invalid: ${nodeId}`, ...logs].slice(0, 12));
        return;
      }

      setDecisionLog((logs) => [`Locked: ${nodeId}`, ...logs].slice(0, 12));
      setFeedback(`Valid lock: ${nodeId}. Distances updated.`);
      setFeedbackTone("inside");

      if (result.status === "won" && result.targetDistance !== undefined && result.optimalDistance !== undefined && result.delta !== undefined && result.bestCost !== undefined) {
        setGameState("won");
        setRoundSummary({
          targetDistance: result.targetDistance,
          optimalDistance: result.optimalDistance,
          delta: result.delta,
          bestCost: result.bestCost
        });
        setFeedback(`Target ${result.targetId} solved.`);
        setFeedbackTone("correct");
        if (result.bestUpdated) {
          setBestCost(result.bestCost);
          setBestDelta(result.delta);
        }
        try {
          setLeaderboard(await getDijkstraLeaderboard(5));
        } catch {
          // ignore refresh failures
        }
      }
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not submit lock.");
    }
  }

  const locked = new Set(state?.lockedOrder ?? []);

  return (
    <section>
      <h1>Dijkstra (Path Strategy)</h1>
      <p className="subtitle">
        Lock the minimum tentative frontier node each turn to reach the shortest path.
      </p>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Scenario</div>
          <div className="stat-value">{state?.scenarioId ?? "-"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Start / Target</div>
          <div className="stat-value">{state ? `${state.startId} -> ${state.targetId}` : "-"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Valid Locks</div>
          <div className="stat-value">{state?.validLocks ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Invalid Locks</div>
          <div className="stat-value">{state?.invalidLocks ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hints Used</div>
          <div className="stat-value">{hintsUsed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best Score</div>
          <div className="stat-value">
            {bestCost === null ? "No record" : `${bestCost} (delta ${bestDelta ?? 0})`}
          </div>
        </div>
      </div>

      {gameState !== "playing" && (
        <button type="button" className="primary-btn" onClick={() => void beginGame()}>
          {gameState === "won" ? "Play Again" : "Start Game"}
        </button>
      )}

      {gameState === "playing" && state && (
        <div className="dijkstra-board">
          <div className="dijkstra-board-head">
            <h2>Node Locks</h2>
            <div className="dijkstra-actions">
              <button type="button" className="ghost-btn" onClick={useHint}>
                Hint
              </button>
              <button type="button" className="ghost-btn" onClick={() => void beginGame()}>
                Restart
              </button>
            </div>
          </div>

          <div className="dijkstra-node-grid">
            {state.graph.nodes.map((node) => {
              const isLocked = locked.has(node);
              const isFrontier = !isLocked && Number.isFinite(state.distances[node]);
              return (
                <button
                  key={node}
                  type="button"
                  className={`dijkstra-node ${isLocked ? "locked" : isFrontier ? "frontier" : "unvisited"}`}
                  onClick={() => void lockNode(node)}
                  disabled={isLocked}
                  title={`Lock ${node}`}
                >
                  <div className="dijkstra-node-id">{node}</div>
                  <div className="dijkstra-node-distance">d={getDistanceLabel(state.distances[node])}</div>
                </button>
              );
            })}
          </div>

          <div className="dijkstra-edge-list">
            <h3>Edges</h3>
            <ul>
              {state.graph.nodes.flatMap((from) =>
                state.graph.adjacency[from].map((edge) => (
                  <li key={`${from}-${edge.to}-${edge.weight}`}>
                    {from} {"->"} {edge.to} (w={edge.weight})
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="dijkstra-log">
            <h3>Decision Log</h3>
            {decisionLog.length === 0 && <p className="meta-text">No actions yet.</p>}
            {decisionLog.length > 0 && (
              <ol>
                {decisionLog.map((entry, idx) => (
                  <li key={`${entry}-${idx}`}>{entry}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {inputError && <p className="error">{inputError}</p>}
      {showHint && <p className="meta-text">Hint displayed in feedback banner.</p>}
      <div className={`feedback-banner ${feedbackTone}`}>{feedback}</div>

      {gameState === "won" && state && (
        <div className="result-box">
          <h2>Round Complete</h2>
          <p>
            Target distance (player vs optimal): {getDistanceLabel(targetDistance)} vs {getDistanceLabel(optimalDistance)}
          </p>
          <p>Performance delta: {delta}</p>
          <p>Score cost: {roundSummary?.bestCost ?? "-"}</p>
          <p>Valid locks: {state.validLocks}</p>
          <p>Invalid locks: {state.invalidLocks}</p>
          <p>Hints used: {hintsUsed}</p>
          <p>Player path: {getPathLabel(playerPath)}</p>
          <p className="meta-text">Game ID: {DIJKSTRA_PATH_STRATEGY_GAME_ID}</p>
        </div>
      )}

      <div className="leaderboard">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 && <p className="meta-text">No leaderboard entries yet.</p>}
        {leaderboard.length > 0 && (
          <ol>
            {leaderboard.map((entry) => (
              <li key={entry.uid}>
                {entry.uid.slice(0, 6)}... - {entry.bestCost} (delta {entry.delta})
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
