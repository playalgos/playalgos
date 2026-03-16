import { useEffect, useMemo, useState } from "react";
import {
  KNAPSACK_TREASURE_GAME_ID,
  solveKnapsackOptimal,
  type KnapsackItem
} from "../games/knapsackTreasure";
import { auth } from "../firebase/client";
import {
  getKnapsackBestScore,
  getKnapsackLeaderboard,
  startKnapsackSessionWithOptions,
  submitKnapsackSelection,
  type KnapsackMode
} from "../firebase/knapsackTreasureStore";

type GameState = "idle" | "playing" | "won";
type FeedbackTone = "neutral" | "outside" | "correct";

type ProgressStats = {
  played: number;
  won: number;
  optimalWon: number;
  totalDelta: number;
  dailyWins: number;
  lastDailyKey: string | null;
};

const PROGRESSION_KEY = "seekv8.knapsack.progress.v1";
const INITIAL_PROGRESS: ProgressStats = {
  played: 0,
  won: 0,
  optimalWon: 0,
  totalDelta: 0,
  dailyWins: 0,
  lastDailyKey: null
};

function titleFromItemId(itemId: string): string {
  return itemId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPerformanceLabel(efficiency: number): string {
  if (efficiency >= 1) return "Optimal";
  if (efficiency >= 0.9) return "Close";
  return "Needs Improvement";
}

function getLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function KnapsackTreasurePage() {
  const uid = auth?.currentUser?.uid ?? null;
  const [mode, setMode] = useState<KnapsackMode>("learn");
  const [dailyChallenge, setDailyChallenge] = useState<boolean>(false);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [capacity, setCapacity] = useState<number>(0);
  const [items, setItems] = useState<KnapsackItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string>("Start game to build your treasure bag.");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [inputError, setInputError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<KnapsackMode>("learn");
  const [sessionDailyKey, setSessionDailyKey] = useState<string | null>(null);
  const [submitCount, setSubmitCount] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [finalTimeSeconds, setFinalTimeSeconds] = useState<number | null>(null);

  const [selectedValue, setSelectedValue] = useState<number>(0);
  const [usedWeight, setUsedWeight] = useState<number>(0);
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [optimalValue, setOptimalValue] = useState<number>(0);
  const [delta, setDelta] = useState<number>(0);
  const [efficiency, setEfficiency] = useState<number>(0);

  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestDelta: number; selectedValue: number }>>(
    []
  );
  const [progress, setProgress] = useState<ProgressStats>(INITIAL_PROGRESS);

  const showRatioHints = sessionMode === "learn";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROGRESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ProgressStats>;
      setProgress({
        played: parsed.played ?? 0,
        won: parsed.won ?? 0,
        optimalWon: parsed.optimalWon ?? 0,
        totalDelta: parsed.totalDelta ?? 0,
        dailyWins: parsed.dailyWins ?? 0,
        lastDailyKey: parsed.lastDailyKey ?? null
      });
    } catch {
      setProgress(INITIAL_PROGRESS);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    if (gameState !== "playing" || sessionMode !== "speedrun" || startedAtMs === null) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, sessionMode, startedAtMs]);

  const liveTotals = useMemo(() => {
    let nextWeight = 0;
    let nextValue = 0;
    for (const index of selectedIndices) {
      const item = items[index];
      if (!item) continue;
      nextWeight += item.weight;
      nextValue += item.value;
    }
    return { usedWeight: nextWeight, selectedValue: nextValue };
  }, [items, selectedIndices]);

  const selectedItemLabels = selectedIndices
    .slice()
    .sort((a, b) => a - b)
    .map((index) => titleFromItemId(items[index]?.id ?? String(index)));

  const optimalExplanation = useMemo(() => {
    if (capacity <= 0 || items.length === 0) return null;
    return solveKnapsackOptimal({ capacity, items });
  }, [capacity, items]);

  const optimalItemLabels = useMemo(() => {
    if (!optimalExplanation) return [];
    return optimalExplanation.selectedIndices.map((index) => titleFromItemId(items[index]?.id ?? String(index)));
  }, [items, optimalExplanation]);

  const learnHint = useMemo(() => {
    if (!showRatioHints || gameState !== "playing") return null;
    const remaining = capacity - liveTotals.usedWeight;
    let bestIndex: number | null = null;
    let bestRatio = -1;
    items.forEach((item, index) => {
      if (selectedIndices.includes(index)) return;
      const ratio = item.value / Math.max(1, item.weight);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIndex = index;
      }
    });
    return {
      remaining,
      bestItemLabel: bestIndex === null ? "None" : titleFromItemId(items[bestIndex].id),
      bestRatio
    };
  }, [capacity, gameState, items, liveTotals.usedWeight, selectedIndices, showRatioHints]);

  const averageDelta = progress.won === 0 ? 0 : progress.totalDelta / progress.won;

  useEffect(() => {
    if (!uid) return;
    void (async () => {
      try {
        const best = await getKnapsackBestScore(uid);
        setBestDelta(best?.bestDelta ?? null);
      } catch {
        setBestDelta(null);
      }
    })();
  }, [uid]);

  useEffect(() => {
    void (async () => {
      try {
        setLeaderboard(await getKnapsackLeaderboard(5));
      } catch {
        setLeaderboard([]);
      }
    })();
  }, []);

  async function beginGame(): Promise<void> {
    setSelectedIndices([]);
    setInputError("");
    setSubmitCount(0);
    setSelectedValue(0);
    setUsedWeight(0);
    setSelectedCount(0);
    setOptimalValue(0);
    setDelta(0);
    setEfficiency(0);
    setElapsedSeconds(0);
    setFinalTimeSeconds(null);
    setStartedAtMs(Date.now());
    setFeedback("Select items without exceeding capacity, then submit your bag.");
    setFeedbackTone("neutral");

    const dailyKey = dailyChallenge ? getLocalDateKey() : undefined;
    try {
      const session = await startKnapsackSessionWithOptions({
        mode,
        dailyKey
      });
      if (!session) {
        setInputError("Could not start knapsack session.");
        setGameState("idle");
        return;
      }

      setSessionId(session.sessionId);
      setCapacity(session.capacity);
      setItems(session.items);
      setSubmitCount(session.submitAttempts);
      setSessionMode(session.mode);
      setSessionDailyKey(session.dailyKey);
      setGameState("playing");
      setProgress((prev) => ({ ...prev, played: prev.played + 1 }));
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not start knapsack session.");
      setGameState("idle");
    }
  }

  function toggleItem(index: number): void {
    if (gameState !== "playing") return;
    setSelectedIndices((prev) => (prev.includes(index) ? prev.filter((v) => v !== index) : [...prev, index]));
  }

  async function submitBag(): Promise<void> {
    if (gameState !== "playing" || !sessionId) return;
    setInputError("");

    try {
      const result = await submitKnapsackSelection({
        sessionId,
        selectedIndices
      });

      setSubmitCount(result.submitAttempts);
      setSelectedValue(result.selectedValue);
      setUsedWeight(result.usedWeight);
      setSelectedCount(result.selectedCount);
      setOptimalValue(result.optimalValue);
      setDelta(result.delta);
      setEfficiency(result.efficiency);
      setSessionMode(result.mode);
      setSessionDailyKey(result.dailyKey);

      if (!result.isValid) {
        if (result.overweightBy > 0) {
          setFeedback(`Over capacity by ${result.overweightBy}. Remove weight and submit again.`);
        } else {
          setFeedback("Invalid selection detected. Adjust your bag and submit again.");
        }
        setFeedbackTone("outside");
        return;
      }

      setGameState("won");
      setFeedback("Bag locked. Round complete.");
      setFeedbackTone("correct");
      setFinalTimeSeconds(elapsedSeconds);
      setStartedAtMs(null);

      if (typeof result.delta === "number" && (bestDelta === null || result.delta < bestDelta)) {
        setBestDelta(result.delta);
      }

      setProgress((prev) => ({
        ...prev,
        won: prev.won + 1,
        optimalWon: prev.optimalWon + (result.delta === 0 ? 1 : 0),
        totalDelta: prev.totalDelta + result.delta,
        dailyWins:
          result.dailyKey && result.dailyKey !== prev.lastDailyKey ? prev.dailyWins + 1 : prev.dailyWins,
        lastDailyKey: result.dailyKey ?? prev.lastDailyKey
      }));

      try {
        setLeaderboard(await getKnapsackLeaderboard(5));
      } catch {
        // best-effort refresh
      }
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not submit bag.");
    }
  }

  return (
    <section>
      <h1>Knapsack (Treasure Bag)</h1>
      <p className="subtitle">
        Pick items that maximize value while keeping total weight under the bag capacity.
      </p>

      <div className="mode-controls">
        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as KnapsackMode)}
            disabled={gameState === "playing"}
          >
            <option value="learn">Learn</option>
            <option value="challenge">Challenge</option>
            <option value="speedrun">Speedrun</option>
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={dailyChallenge}
            onChange={(event) => setDailyChallenge(event.target.checked)}
            disabled={gameState === "playing"}
          />
          Daily seed challenge
        </label>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Capacity</div>
          <div className="stat-value">{capacity || "-"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Used Weight</div>
          <div className="stat-value">{gameState === "won" ? usedWeight : liveTotals.usedWeight}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Selected Value</div>
          <div className="stat-value">{gameState === "won" ? selectedValue : liveTotals.selectedValue}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best Delta</div>
          <div className="stat-value">{bestDelta === null ? "No record" : bestDelta}</div>
        </div>
        {sessionMode === "speedrun" && (
          <div className="stat-card">
            <div className="stat-label">Timer</div>
            <div className="stat-value">{gameState === "won" ? `${finalTimeSeconds ?? 0}s` : `${elapsedSeconds}s`}</div>
          </div>
        )}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Rounds Played</div>
          <div className="stat-value">{progress.played}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wins</div>
          <div className="stat-value">{progress.won}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Optimal Wins</div>
          <div className="stat-value">{progress.optimalWon}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Delta</div>
          <div className="stat-value">{progress.won === 0 ? "-" : averageDelta.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Daily Wins</div>
          <div className="stat-value">{progress.dailyWins}</div>
        </div>
      </div>

      {gameState !== "playing" && (
        <button type="button" className="primary-btn" onClick={() => void beginGame()}>
          {gameState === "won" ? "Play Again" : "Start Game"}
        </button>
      )}

      {gameState === "playing" && (
        <div className="knapsack-board">
          <div className="knapsack-board-head">
            <h2>
              Treasure Items
              <span className="meta-text"> ({sessionMode}{sessionDailyKey ? ` | daily ${sessionDailyKey}` : ""})</span>
            </h2>
            <button type="button" className="ghost-btn" onClick={() => void beginGame()}>
              Restart
            </button>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "14px", color: "#475569", marginBottom: "8px" }}>Bag Capacity ({liveTotals.usedWeight} / {capacity})</h3>
            <svg viewBox="0 0 600 60" style={{ width: "100%", height: "auto", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {/* Background Capacity Bar */}
              <rect x="10" y="20" width="580" height="20" rx="10" fill="#e2e8f0" />
              
              {/* Used Capacity Bar */}
              {(() => {
                const percentage = Math.min(100, (liveTotals.usedWeight / capacity) * 100);
                const isOverweight = liveTotals.usedWeight > capacity;
                let fill = "#34d399";
                if (percentage > 85) fill = "#fbbf24";
                if (isOverweight) fill = "#ef4444";
                
                return (
                  <rect x="10" y="20" width={(percentage / 100) * 580} height="20" rx="10" fill={fill} style={{ transition: "all 0.3s ease" }} />
                );
              })()}
              
              {/* Item Segment Blocks over the bar */}
              {(() => {
                let currentX = 10;
                return selectedIndices.map((idx) => {
                  const item = items[idx];
                  if (!item) return null;
                  const itemWidth = (item.weight / capacity) * 580;
                  const block = (
                    <g key={item.id} transform={`translate(${currentX}, 20)`}>
                      <rect x="0" y="0" width={itemWidth} height="20" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.5" />
                      {itemWidth > 20 && <text x={itemWidth / 2} y="14" fontSize="10" fill="#ffffff" textAnchor="middle" fontWeight="bold">{item.weight}</text>}
                    </g>
                  );
                  currentX += itemWidth;
                  return block;
                });
              })()}
              
              {/* Boundary Markers */}
              <text x="10" y="55" fontSize="12" fill="#64748b" textAnchor="middle">0</text>
              <text x="590" y="55" fontSize="12" fill="#64748b" textAnchor="middle">{capacity}</text>
            </svg>
          </div>

          <div className="knapsack-table-wrap">
            <table className="knapsack-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Weight</th>
                  <th>Value</th>
                  {showRatioHints && <th>Ratio</th>}
                  <th>Select</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const selected = selectedIndices.includes(index);
                  return (
                    <tr key={item.id} className={selected ? "is-selected" : ""}>
                      <td>{titleFromItemId(item.id)}</td>
                      <td>{item.weight}</td>
                      <td>{item.value}</td>
                      {showRatioHints && <td>{(item.value / Math.max(1, item.weight)).toFixed(2)}</td>}
                      <td>
                        <button
                          type="button"
                          className={`ghost-btn ${selected ? "selected" : ""}`}
                          onClick={() => toggleItem(index)}
                        >
                          {selected ? "Remove" : "Add"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {learnHint && (
            <div className="knapsack-hint">
              <p>Hint: Remaining capacity {learnHint.remaining}.</p>
              <p>
                Best remaining value/weight item: {learnHint.bestItemLabel} ({learnHint.bestRatio.toFixed(2)})
              </p>
            </div>
          )}

          <div className="knapsack-actions">
            <button type="button" className="primary-btn" onClick={() => void submitBag()}>
              Submit Bag
            </button>
          </div>
        </div>
      )}

      {inputError && <p className="error">{inputError}</p>}
      <div className={`feedback-banner ${feedbackTone}`}>{feedback}</div>

      {gameState === "won" && (
        <div className="result-box">
          <h2>Result</h2>
          <p>Selected items: {selectedItemLabels.join(", ") || "None"}</p>
          <p>
            Used weight: {usedWeight} / {capacity}
          </p>
          <p>Selected value: {selectedValue}</p>
          <p>Selected count: {selectedCount}</p>
          <p>Optimal value: {optimalValue}</p>
          <p>Efficiency: {(efficiency * 100).toFixed(1)}%</p>
          <p>Performance: {getPerformanceLabel(efficiency)}</p>
          <p>Delta: {delta}</p>
          <p>Submit attempts: {submitCount}</p>
          {sessionMode === "speedrun" && <p>Speedrun time: {finalTimeSeconds ?? 0}s</p>}
          {optimalExplanation && (
            <div className="knapsack-explain">
              <h3>Optimal Set Explanation</h3>
              <p>Optimal items: {optimalItemLabels.join(", ") || "None"}</p>
              <p>Optimal used weight: {optimalExplanation.usedWeight}</p>
              <p>Value gap vs optimal: {Math.max(0, optimalExplanation.optimalValue - selectedValue)}</p>
            </div>
          )}
          <p className="meta-text">Game ID: {KNAPSACK_TREASURE_GAME_ID}</p>
        </div>
      )}

      <div className="leaderboard">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 && <p className="meta-text">No leaderboard entries yet.</p>}
        {leaderboard.length > 0 && (
          <ol>
            {leaderboard.map((entry) => (
              <li key={entry.uid}>
                {entry.uid.slice(0, 6)}... - delta {entry.bestDelta}, value {entry.selectedValue}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
