import { useEffect, useMemo, useState } from "react";
import {
  getActiveRange,
  QUICK_SORT_PIVOT_GAME_ID,
  type QuickSortState
} from "../games/quickSortPivot";
import { auth } from "../firebase/client";
import {
  getQuickSortBestScore,
  getQuickSortLeaderboard,
  startQuickSortSession,
  submitQuickSortPartition
} from "../firebase/quickSortPivotStore";

type GameState = "idle" | "playing" | "won";
type Lane = "left" | "right";
type QuickMode = "learn" | "standard" | "speedrun" | "chaos";
type PivotStrategy = "free" | "first" | "random" | "median3";

function choosePivotIndex(
  range: { low: number; high: number },
  array: number[],
  strategy: PivotStrategy
): number {
  if (strategy === "first") return range.low;
  if (strategy === "random") {
    return Math.floor(Math.random() * (range.high - range.low + 1)) + range.low;
  }
  if (strategy === "median3") {
    const mid = Math.floor((range.low + range.high) / 2);
    const candidates = [range.low, mid, range.high];
    const sorted = [...candidates].sort((a, b) => array[a] - array[b]);
    return sorted[1];
  }
  return -1;
}

export function QuickSortPivotPage() {
  const uid = auth?.currentUser?.uid ?? null;
  const [mode, setMode] = useState<QuickMode>("standard");
  const [pivotStrategy, setPivotStrategy] = useState<PivotStrategy>("free");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [engineState, setEngineState] = useState<QuickSortState>({
    array: [],
    stack: [],
    roundsCompleted: 0,
    invalidSubmits: 0,
    moves: 0,
    isComplete: true
  });
  const [pivotIndex, setPivotIndex] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, Lane>>({});
  const [moves, setMoves] = useState<number>(0);
  const [lastMoveSnapshot, setLastMoveSnapshot] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("Start game to begin partitioning.");
  const [inputError, setInputError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bestCost, setBestCost] = useState<number | null>(null);
  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestCost: number; delta: number }>>([]);
  const [scoreSummary, setScoreSummary] = useState<{ totalCost: number; baselineCost: number; delta: number } | null>(
    null
  );
  const [invalidDetails, setInvalidDetails] = useState<{
    missingIndices: number[];
    duplicateIndices: number[];
    outOfRangeIndices: number[];
    misplacedLeftIndices: number[];
    misplacedRightIndices: number[];
  } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [perfectStreak, setPerfectStreak] = useState<number>(0);
  const [chaosTick, setChaosTick] = useState<number>(0);

  const activeRange = getActiveRange(engineState);
  const activeIndices = useMemo(() => {
    if (!activeRange) return [];
    const arr: number[] = [];
    for (let i = activeRange.low; i <= activeRange.high; i += 1) arr.push(i);
    return arr;
  }, [activeRange]);

  const pendingMoveDelta = Math.max(0, moves - lastMoveSnapshot);
  const currentCost = engineState.roundsCompleted + engineState.invalidSubmits + engineState.moves;
  const predictedAcceptedCost = currentCost + pendingMoveDelta + 1;
  const predictedInvalidCost = currentCost + pendingMoveDelta + 1;
  const baselineNow = Math.max(1, engineState.array.length - 1);

  useEffect(() => {
    if (gameState !== "playing" || mode !== "speedrun" || startedAtMs === null) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, mode, startedAtMs]);

  useEffect(() => {
    if (gameState !== "playing" || !activeRange || pivotIndex !== null || pivotStrategy === "free") return;
    const chosen = choosePivotIndex(activeRange, engineState.array, pivotStrategy);
    if (chosen >= 0) {
      setPivotIndex(chosen);
      setAssignments({});
      setFeedback(`Pivot auto-selected by ${pivotStrategy} strategy.`);
    }
  }, [gameState, activeRange, pivotIndex, pivotStrategy, engineState.array]);

  useEffect(() => {
    if (!uid) return;
    void (async () => {
      try {
        const best = await getQuickSortBestScore(uid);
        if (best) {
          setBestCost(best.bestCost);
          setBestDelta(best.delta);
        }
      } catch {
        // Keep page usable even if read fails.
      }
    })();
  }, [uid]);

  useEffect(() => {
    void (async () => {
      try {
        setLeaderboard(await getQuickSortLeaderboard(5));
      } catch {
        setLeaderboard([]);
      }
    })();
  }, []);

  async function beginGame(): Promise<void> {
    setGameState("playing");
    setPivotIndex(null);
    setAssignments({});
    setMoves(0);
    setLastMoveSnapshot(0);
    setInputError("");
    setScoreSummary(null);
    setInvalidDetails(null);
    setPerfectStreak(0);
    setElapsedSeconds(0);
    setStartedAtMs(Date.now());
    setChaosTick(0);
    setFeedback("Choose a pivot from the highlighted subarray.");

    try {
      const state = await startQuickSortSession(8);
      if (!state) {
        setInputError("Could not start quick sort session.");
        setGameState("idle");
        return;
      }
      setSessionId(state.sessionId);
      setEngineState(state);
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not start quick sort session.");
      setGameState("idle");
    }
  }

  function selectPivot(index: number): void {
    if (pivotStrategy !== "free") return;
    setPivotIndex(index);
    setAssignments({});
    setFeedback("Assign each remaining element to Left (< pivot) or Right (>= pivot).");
  }

  function assignLane(index: number, lane: Lane): void {
    setAssignments((prev) => {
      if (prev[index] === lane) return prev;
      setMoves((current) => current + 1);
      return { ...prev, [index]: lane };
    });
  }

  async function submitPartition(): Promise<void> {
    if (!activeRange || pivotIndex === null || !sessionId) {
      setFeedback("Select a pivot first.");
      return;
    }

    const nonPivotIndices = activeIndices.filter((i) => i !== pivotIndex);
    const unassigned = nonPivotIndices.filter((i) => assignments[i] === undefined);
    if (unassigned.length > 0) {
      setFeedback("Assign all active elements before submitting.");
      return;
    }

    setInputError("");
    const leftIndices = nonPivotIndices.filter((i) => assignments[i] === "left");
    const rightIndices = nonPivotIndices.filter((i) => assignments[i] === "right");
    const moveDelta = moves - lastMoveSnapshot;

    let result:
        | {
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
        }
      | undefined;

    try {
      result = await submitQuickSortPartition({
        sessionId,
        pivotIndex,
        leftIndices,
        rightIndices,
        moveDelta
      });
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not submit partition.");
      return;
    }

    setEngineState(result.state);
    setMoves(result.state.moves);
    setPivotIndex(null);
    setAssignments({});
    setLastMoveSnapshot(result.state.moves);

    if (!result.accepted) {
      setInvalidDetails(result.invalidDetails);
      setPerfectStreak(0);
      if (mode === "chaos") setChaosTick((n) => n + 1);
      setFeedback(
        `Invalid partition. Accuracy ${(result.accuracy * 100).toFixed(0)}%. Fix and try next round.`
      );
      return;
    }
    setInvalidDetails(null);

    if (result.accuracy === 1) {
      setPerfectStreak((n) => n + 1);
    } else {
      setPerfectStreak(0);
    }
    if (mode === "chaos") setChaosTick((n) => n + 1);

    if (result.state.isComplete && result.totalCost !== undefined && result.baselineCost !== undefined && result.delta !== undefined) {
      setGameState("won");
      setStartedAtMs(null);
      setScoreSummary({
        totalCost: result.totalCost,
        baselineCost: result.baselineCost,
        delta: result.delta
      });
      setFeedback("Sorted successfully. Quick Sort complete.");
      if (result.bestUpdated) {
        setBestCost(result.totalCost);
        setBestDelta(result.delta);
      }
      try {
        setLeaderboard(await getQuickSortLeaderboard(5));
      } catch {
        // ignore refresh failure
      }
      return;
    }

    setFeedback(
      `Partition accepted. Balance ${(result.balanceScore * 100).toFixed(0)}%. Choose pivot for next subarray.`
    );
  }

  return (
    <section>
      <h1>Quick Sort Pivot Game</h1>
      <p className="subtitle">
        Choose pivots and partition active subarrays into Left ({`< pivot`}) and Right ({`>= pivot`}).
      </p>

      <div className="mode-controls">
        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as QuickMode)}
            disabled={gameState === "playing"}
          >
            <option value="learn">Learn</option>
            <option value="standard">Standard</option>
            <option value="speedrun">Speedrun</option>
            <option value="chaos">Chaos</option>
          </select>
        </label>
        <label>
          Pivot Strategy
          <select
            value={pivotStrategy}
            onChange={(event) => setPivotStrategy(event.target.value as PivotStrategy)}
            disabled={gameState === "playing"}
          >
            <option value="free">Free Choice</option>
            <option value="first">First Element</option>
            <option value="random">Random</option>
            <option value="median3">Median of 3</option>
          </select>
        </label>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Rounds Completed</div>
          <div className="stat-value">{engineState.roundsCompleted}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Moves</div>
          <div className="stat-value">{moves}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Invalid Submits</div>
          <div className="stat-value">{engineState.invalidSubmits}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best Cost</div>
          <div className="stat-value">{bestCost === null ? "No record" : `${bestCost} (Δ ${bestDelta ?? 0})`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Perfect Streak</div>
          <div className="stat-value">{perfectStreak}</div>
        </div>
        {mode === "speedrun" && (
          <div className="stat-card">
            <div className="stat-label">Elapsed</div>
            <div className="stat-value">{elapsedSeconds}s</div>
          </div>
        )}
      </div>

      <div className="score-breakdown">
        <h3>Live Scoring</h3>
        <p>Current cost: {currentCost}</p>
        <p>Pending move delta: {pendingMoveDelta}</p>
        <p>If next submit is accepted: {predictedAcceptedCost}</p>
        <p>If next submit is invalid: {predictedInvalidCost}</p>
        <p>Current baseline: {baselineNow}</p>
        <p>Current delta estimate: {currentCost - baselineNow}</p>
      </div>

      {gameState !== "playing" && (
        <button type="button" className="primary-btn" onClick={() => void beginGame()}>
          {gameState === "won" ? "Play Again" : "Start Game"}
        </button>
      )}

      {gameState === "playing" && (
        <div className={`quicksort-board ${mode === "chaos" ? "chaos" : ""} chaos-${chaosTick % 4}`}>
          <h2>Array Board</h2>
          <div className="array-visualizer" style={{ margin: "20px 0", textAlign: "center", background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
            <svg viewBox={`0 0 ${Math.max(600, engineState.array.length * 40 + 40)} 150`} style={{ maxWidth: "100%", height: "auto" }}>
              {engineState.array.map((value, index) => {
                const inActive = activeRange ? index >= activeRange.low && index <= activeRange.high : false;
                const isPivot = pivotIndex === index;
                // values typically 1-99
                const maxVal = Math.max(...engineState.array, 100);
                const barHeight = Math.max(10, (value / maxVal) * 100);
                const xPos = index * 40 + 20;
                
                let fill = "#cbd5e1";
                if (inActive) fill = "#bae6fd";
                if (isPivot) fill = "#34d399";
                if (assignments[index] === "left") fill = "#fbbf24";
                if (assignments[index] === "right") fill = "#a78bfa";
                
                const isInteractive = inActive && pivotStrategy === "free";
                
                return (
                  <g 
                    key={`${index}-${value}`}
                    transform={`translate(${xPos}, 0)`}
                    onClick={() => { if (isInteractive) selectPivot(index); }}
                    style={{ cursor: isInteractive ? "pointer" : "default", outline: "none" }}
                    role={isInteractive ? "button" : "presentation"}
                    aria-label={`Select pivot ${value} at index ${index}`}
                    tabIndex={isInteractive ? 0 : -1}
                    onKeyDown={(e) => { if (isInteractive && (e.key === "Enter" || e.key === " ")) selectPivot(index); }}
                  >
                    <rect x="0" y={120 - barHeight} width="30" height={barHeight} fill={fill} rx="4" stroke={inActive && !isPivot && !assignments[index] ? "#38bdf8" : "none"} strokeWidth="2" style={{ transition: "all 0.3s" }} className={isInteractive ? "hover-bar" : ""} />
                    <text x="15" y="140" fontSize="12" fill="#0f172a" textAnchor="middle" fontWeight="bold">{value}</text>
                  </g>
                );
              })}
            </svg>
            <style>{`.hover-bar:hover { filter: brightness(0.9); }`}</style>
            
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "12px", fontSize: "12px", fontWeight: "bold", flexWrap: "wrap" }}>
              <span style={{ color: "#cbd5e1" }}>■ Inactive</span>
              <span style={{ color: "#38bdf8" }}>■ Active (Click to set Pivot)</span>
              <span style={{ color: "#34d399" }}>■ Pivot</span>
              <span style={{ color: "#fbbf24" }}>■ Left Subarray</span>
              <span style={{ color: "#a78bfa" }}>■ Right Subarray</span>
            </div>
          </div>

          {activeRange && (
            <p className="meta-text">
              Active subarray: index {activeRange.low} to {activeRange.high}
            </p>
          )}

          {pivotIndex !== null && activeRange && (
            <div className="partition-panel">
              <h3>Partition Assignment</h3>
              <p className="meta-text">
                Pivot value: {engineState.array[pivotIndex]} (index {pivotIndex})
              </p>

              <div className="partition-list">
                {activeIndices
                  .filter((i) => i !== pivotIndex)
                  .map((i) => (
                    <div key={i} className="partition-row">
                      <span className="partition-value">{engineState.array[i]}</span>
                      {mode === "learn" && (
                        <span className="hint-chip">
                          {engineState.array[i] < engineState.array[pivotIndex] ? "Hint: Left" : "Hint: Right"}
                        </span>
                      )}
                      <div className="partition-actions">
                        <button
                          type="button"
                          className={`ghost-btn ${assignments[i] === "left" ? "selected" : ""}`}
                          onClick={() => assignLane(i, "left")}
                        >
                          Left
                        </button>
                        <button
                          type="button"
                          className={`ghost-btn ${assignments[i] === "right" ? "selected" : ""}`}
                          onClick={() => assignLane(i, "right")}
                        >
                          Right
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="range-options">
            <button type="button" className="primary-btn" onClick={() => void submitPartition()}>
              Submit Partition
            </button>
            <button type="button" className="ghost-btn" onClick={() => void beginGame()}>
              Restart
            </button>
          </div>
        </div>
      )}

      {inputError && <p className="error">{inputError}</p>}

      <div className="feedback-banner">{feedback}</div>

      {invalidDetails && (
        <div className="diagnostics-box">
          <h3>Why Submit Failed</h3>
          <p>
            Missing indices:{" "}
            {invalidDetails.missingIndices.length ? invalidDetails.missingIndices.join(", ") : "none"}
          </p>
          <p>
            Duplicate indices:{" "}
            {invalidDetails.duplicateIndices.length ? invalidDetails.duplicateIndices.join(", ") : "none"}
          </p>
          <p>
            Out-of-range indices:{" "}
            {invalidDetails.outOfRangeIndices.length ? invalidDetails.outOfRangeIndices.join(", ") : "none"}
          </p>
          <p>
            Misplaced in Left lane:{" "}
            {invalidDetails.misplacedLeftIndices.length ? invalidDetails.misplacedLeftIndices.join(", ") : "none"}
          </p>
          <p>
            Misplaced in Right lane:{" "}
            {invalidDetails.misplacedRightIndices.length ? invalidDetails.misplacedRightIndices.join(", ") : "none"}
          </p>
        </div>
      )}

      {gameState === "won" && (
        <div className="result-box">
          <h2>Result</h2>
          <p>Sorted array: {engineState.array.join(", ")}</p>
          <p>Rounds completed: {engineState.roundsCompleted}</p>
          <p>
            Moves used: {moves}{" "}
            <span className="hint-dot" data-tip="Number of lane assignment actions made by the player.">
              ?
            </span>
          </p>
          <p>
            Invalid submits: {engineState.invalidSubmits}{" "}
            <span className="hint-dot" data-tip="Count of partition submissions that failed validation.">
              ?
            </span>
          </p>
          {scoreSummary && (
            <>
              <p>
                Total cost: {scoreSummary.totalCost}{" "}
                <span
                  className="hint-dot"
                  data-tip="Combined effort score: rounds completed + invalid submits + moves."
                >
                  ?
                </span>
              </p>
              <p>
                Baseline cost: {scoreSummary.baselineCost}{" "}
                <span
                  className="hint-dot"
                  data-tip="Reference quick-sort cost for this input size used for comparison."
                >
                  ?
                </span>
              </p>
              <p>
                Delta: {scoreSummary.delta}{" "}
                <span
                  className="hint-dot"
                  data-tip="Total cost minus baseline cost. Lower is better."
                >
                  ?
                </span>
              </p>
              {mode === "speedrun" && <p>Elapsed: {elapsedSeconds}s</p>}
            </>
          )}
          <p className="meta-text">Game ID: {QUICK_SORT_PIVOT_GAME_ID}</p>
        </div>
      )}

      <div className="leaderboard">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 && <p className="meta-text">No leaderboard entries yet.</p>}
        {leaderboard.length > 0 && (
          <ol>
            {leaderboard.map((entry) => (
              <li key={entry.uid}>
                {entry.uid.slice(0, 6)}... - cost {entry.bestCost} (Δ {entry.delta})
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
