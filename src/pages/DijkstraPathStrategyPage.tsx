import { useEffect, useState } from "react";
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
  distances: Record<string, number | null>;
  previous: Record<string, string | null>;
  lockedOrder: string[];
  validLocks: number;
  invalidLocks: number;
};

function getDistanceLabel(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "∞";
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
    if (typeof distance !== "number" || !Number.isFinite(distance)) continue;
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

const PRESET_LAYOUTS: Record<string, Record<string, { x: number; y: number }>> = {
  "city-1": {
    A: { x: 100, y: 150 },
    B: { x: 280, y: 70 },
    C: { x: 280, y: 230 },
    D: { x: 460, y: 150 }
  },
  "city-2": {
    S: { x: 80, y: 150 },
    U: { x: 220, y: 70 },
    V: { x: 220, y: 230 },
    W: { x: 360, y: 70 },
    T: { x: 500, y: 150 }
  }
};

function getLayout(scenarioId: string, nodes: string[]): Record<string, { x: number; y: number }> {
  if (PRESET_LAYOUTS[scenarioId]) return PRESET_LAYOUTS[scenarioId];
  const N = nodes.length;
  const layout: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, i) => {
    const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
    layout[node] = { x: 280 + 160 * Math.cos(angle), y: 150 + 100 * Math.sin(angle) };
  });
  return layout;
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
  const [showDistances, setShowDistances] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string>("");
  const [bestCost, setBestCost] = useState<number | null>(null);
  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestCost: number; delta: number }>>([]);
  const [roundSummary, setRoundSummary] = useState<{
    targetDistance: number | null;
    optimalDistance: number | null;
    delta: number;
    bestCost: number;
  } | null>(null);

  const targetDistance = roundSummary?.targetDistance ?? (state ? state.distances[state.targetId] : null);
  const optimalDistance = roundSummary?.optimalDistance ?? null;
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
    setShowDistances(false);
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
      setFeedback(
        `Game started. Tentative distances are hidden by default, so compute the next lock from ${session.startId} toward ${session.targetId}.`
      );
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

  function revealDistances(): void {
    if (!state || gameState !== "playing" || showDistances) return;
    setHintsUsed((value) => value + 1);
    setShowDistances(true);
    setFeedback("Assist mode on: tentative distances and frontier highlighting are now visible for this round.");
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

      const lockedDistance = nextState.distances[nodeId];
      setDecisionLog((logs) => [
        `Locked: ${nodeId} at d=${getDistanceLabel(lockedDistance)}`,
        ...logs
      ].slice(0, 12));
      setFeedback(`Valid lock: ${nodeId}. Recompute the frontier before your next move.`);
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
  const layout = state ? getLayout(state.scenarioId, state.graph.nodes) : {};

  return (
    <section>
      <h1>Dijkstra (Path Strategy)</h1>
      <p className="subtitle">
        Default mode hides tentative distances. You need to infer the next minimum node from the graph, weights, and lock history.
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
              <button
                type="button"
                className="ghost-btn"
                onClick={revealDistances}
                disabled={showDistances}
              >
                {showDistances ? "Distances Visible" : "Show Distances (+1 hint)"}
              </button>
              <button type="button" className="ghost-btn" onClick={useHint}>
                Hint
              </button>
              <button type="button" className="ghost-btn" onClick={() => void beginGame()}>
                Restart
              </button>
            </div>
          </div>

          <div className="dijkstra-graph-container" style={{ margin: "20px 0", textAlign: "center", overflowX: "auto" }}>
            <svg viewBox="0 0 560 300" style={{ maxWidth: "100%", height: "auto", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
                <marker id="arrowhead-active" markerWidth="10" markerHeight="7" refX="28" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                </marker>
              </defs>

              {/* Edges */}
              {state.graph.nodes.flatMap((from) =>
                state.graph.adjacency[from].map((edge) => {
                  const p1 = layout[from];
                  const p2 = layout[edge.to];
                  if (!p1 || !p2) return null;
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;
                  const isPath = state.previous[edge.to] === from && locked.has(edge.to);
                  return (
                    <g key={`${from}-${edge.to}`}>
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={isPath ? "#10b981" : "#cbd5e1"}
                        strokeWidth={isPath ? 3 : 2}
                        markerEnd={isPath ? "url(#arrowhead-active)" : "url(#arrowhead)"}
                      />
                      <circle cx={midX} cy={midY} r="12" fill="#ffffff" stroke={isPath ? "#10b981" : "#cbd5e1"} strokeWidth="1.5" />
                      <text x={midX} y={midY} textAnchor="middle" dy=".3em" fontSize="12" fontWeight="700" fill={isPath ? "#10b981" : "#475569"}>
                        {edge.weight}
                      </text>
                    </g>
                  );
                })
              )}

              {/* Nodes */}
              {state.graph.nodes.map((node) => {
                const p = layout[node];
                if (!p) return null;
                const isLocked = locked.has(node);
                const isFrontier =
                  !isLocked &&
                  typeof state.distances[node] === "number" &&
                  Number.isFinite(state.distances[node]);
                const displayDistance = isLocked || showDistances ? getDistanceLabel(state.distances[node]) : "?";

                let fill = "#ffffff";
                let stroke = "#cbd5e1";
                if (isLocked) {
                  fill = "#ecfdf5";
                  stroke = "#10b981";
                } else if (showDistances && isFrontier) {
                  fill = "#eff6ff";
                  stroke = "#3b82f6";
                }

                return (
                  <g
                    key={node}
                    transform={`translate(${p.x}, ${p.y})`}
                    onClick={() => { if (!isLocked) void lockNode(node); }}
                    style={{ cursor: isLocked ? "not-allowed" : "pointer", outline: "none" }}
                    role="button"
                    aria-label={`Lock ${node}`}
                    tabIndex={isLocked ? -1 : 0}
                    onKeyDown={(e) => { if (!isLocked && (e.key === "Enter" || e.key === " ")) void lockNode(node); }}
                  >
                    <title>Lock {node}</title>
                    <circle r="22" fill={fill} stroke={stroke} strokeWidth="2" style={{ transition: "all 0.2s" }} />
                    <text textAnchor="middle" dy="-2" fontSize="14" fontWeight="bold" fill="#0f172a">{node}</text>
                    <text textAnchor="middle" dy="12" fontSize="10" fill="#475569" fontWeight="600">d={displayDistance}</text>
                  </g>
                );
              })}
            </svg>
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
