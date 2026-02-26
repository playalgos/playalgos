import { useEffect, useMemo, useState } from "react";
import {
  getOptimalSelections,
  RANGE_NARROWING_GAME_ID,
  RANGE_NARROWING_MAX,
  RANGE_NARROWING_MIN,
  splitInterval,
  type Interval
} from "../games/rangeNarrowing";
import { getPerformanceLabel } from "../games/binarySearch";
import {
  getRangeBestScore,
  getRangeLeaderboard,
  startRangeSession,
  submitRangeSelection
} from "../firebase/rangeNarrowingStore";
import { auth } from "../firebase/client";

type GameState = "idle" | "playing" | "won";
type FeedbackTone = "neutral" | "inside" | "outside" | "correct";
type Difficulty = "easy" | "medium" | "hard";

const INITIAL_INTERVAL: Interval = {
  min: RANGE_NARROWING_MIN,
  max: RANGE_NARROWING_MAX
};

const DIFFICULTY_RANGES: Record<Difficulty, Interval> = {
  easy: { min: 1, max: 50 },
  medium: { min: 1, max: 100 },
  hard: { min: 1, max: 1000 }
};

export function RangeNarrowingPage() {
  const uid = auth?.currentUser?.uid ?? null;
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [timerMode, setTimerMode] = useState<boolean>(false);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [splitPointInput, setSplitPointInput] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const [gameState, setGameState] = useState<GameState>("idle");
  const [target, setTarget] = useState<number | null>(null);
  const [activeInterval, setActiveInterval] = useState<Interval>(INITIAL_INTERVAL);
  const [sessionRange, setSessionRange] = useState<Interval>(INITIAL_INTERVAL);
  const [selections, setSelections] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("Start game to begin narrowing the range.");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [inputError, setInputError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bestSelections, setBestSelections] = useState<number | null>(null);
  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestSelections: number; delta: number }>>(
    []
  );

  const optimalSelections = useMemo(() => getOptimalSelections(sessionRange), [sessionRange]);

  useEffect(() => {
    if (gameState !== "playing" || !timerMode || startedAtMs === null) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, timerMode, startedAtMs]);

  const basePartition =
    gameState === "playing" && activeInterval.min < activeInterval.max ? splitInterval(activeInterval) : null;
  const parsedSplit = Number(splitPointInput);
  const isCustomSplitValid =
    advancedMode &&
    Number.isInteger(parsedSplit) &&
    parsedSplit >= activeInterval.min &&
    parsedSplit < activeInterval.max;

  const partition =
    advancedMode && basePartition && isCustomSplitValid
      ? {
          left: { min: activeInterval.min, max: parsedSplit },
          right: { min: parsedSplit + 1, max: activeInterval.max },
          midpoint: parsedSplit
        }
      : basePartition;

  useEffect(() => {
    if (!uid) return;
    void (async () => {
      try {
        const best = await getRangeBestScore(uid);
        if (best) {
          setBestSelections(best.bestSelections);
          setBestDelta(best.delta);
        }
      } catch {
        // Keep local game available even if read fails.
      }
    })();
  }, [uid]);

  useEffect(() => {
    void (async () => {
      try {
        setLeaderboard(await getRangeLeaderboard(5));
      } catch {
        setLeaderboard([]);
      }
    })();
  }, []);

  async function beginGame(): Promise<void> {
    const selectedRange = DIFFICULTY_RANGES[difficulty];
    setGameState("playing");
    setTarget(null);
    setSessionRange(selectedRange);
    setActiveInterval(selectedRange);
    setSelections(0);
    setElapsedSeconds(0);
    setStartedAtMs(Date.now());
    setInputError("");
    setFeedback(
      `Game started. Choose left or right half of ${selectedRange.min}-${selectedRange.max}.`
    );
    setFeedbackTone("neutral");

    try {
      const session = await startRangeSession({
        rangeMin: selectedRange.min,
        rangeMax: selectedRange.max
      });

      if (!session) {
        setInputError("Could not start session.");
        setSessionId(null);
        return;
      }

      setSessionId(session.sessionId);
      setActiveInterval({ min: session.currentMin, max: session.currentMax });
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not start session.");
      setSessionId(null);
    }
  }

  async function handleSelection(choice: "left" | "right"): Promise<void> {
    if (gameState !== "playing" || !partition || !sessionId) return;
    setInputError("");

    try {
      const result = await submitRangeSelection({
        sessionId,
        selected: choice,
        splitPoint: advancedMode ? partition.midpoint : undefined
      });

      setSelections(result.selections);
      setActiveInterval({ min: result.currentMin, max: result.currentMax });

      if (result.outcome === "inside-selected-range") {
        setFeedback(
          result.penaltyApplied
            ? "Inside selected range. Penalty applied for inefficient split."
            : "Inside selected range. Keep narrowing."
        );
        setFeedbackTone("inside");
        return;
      }

      if (result.outcome === "not-inside-selected-range") {
        setFeedback(
          result.penaltyApplied
            ? "Not inside selected range. Penalty applied for inefficient split."
            : "Not inside selected range. Interval updated."
        );
        setFeedbackTone("outside");
        return;
      }

      setGameState("won");
      setTarget(result.target ?? result.currentMin);
      setStartedAtMs(null);
      setFeedbackTone("correct");
      setFeedback(`Resolved. The hidden number is ${result.target ?? result.currentMin}.`);

      if (result.bestUpdated && typeof result.delta === "number") {
        setBestSelections(result.selections);
        setBestDelta(result.delta);
      }

      try {
        setLeaderboard(await getRangeLeaderboard(5));
      } catch {
        // Best-effort refresh.
      }
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not submit selection.");
    }
  }

  return (
    <section>
      <h1>Range Narrowing Challenge</h1>
      <p className="subtitle">
        Identify the hidden number by repeatedly choosing the correct half of the active interval.
      </p>

      <div className="mode-controls">
        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            disabled={gameState === "playing"}
          >
            <option value="easy">Easy (1-50)</option>
            <option value="medium">Medium (1-100)</option>
            <option value="hard">Hard (1-1000)</option>
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={timerMode}
            onChange={(event) => setTimerMode(event.target.checked)}
            disabled={gameState === "playing"}
          />
          Timer mode
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={advancedMode}
            onChange={(event) => setAdvancedMode(event.target.checked)}
          />
          Advanced split mode
        </label>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Current Interval</div>
          <div className="stat-value">
            {activeInterval.min} to {activeInterval.max}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Selections Used</div>
          <div className="stat-value">{selections}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Optimal Selections</div>
          <div className="stat-value">{optimalSelections}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best Score</div>
          <div className="stat-value">
            {bestSelections === null ? "No record" : `${bestSelections} (${getPerformanceLabel(bestDelta ?? 0)})`}
          </div>
        </div>
        {timerMode && (
          <div className="stat-card">
            <div className="stat-label">Elapsed</div>
            <div className="stat-value">{elapsedSeconds}s</div>
          </div>
        )}
      </div>

      {gameState !== "playing" && (
        <button type="button" className="primary-btn" onClick={() => void beginGame()}>
          {gameState === "won" ? "Play Again" : "Start Game"}
        </button>
      )}

      {gameState === "playing" && partition && (
        <div className="range-options">
          {advancedMode && (
            <label className="split-input">
              Split Point
              <input
                type="number"
                min={activeInterval.min}
                max={activeInterval.max - 1}
                placeholder={`${basePartition?.midpoint ?? activeInterval.min}`}
                value={splitPointInput}
                onChange={(event) => setSplitPointInput(event.target.value)}
              />
            </label>
          )}
          <button type="button" className="primary-btn" onClick={() => void handleSelection("left")}>
            {partition.left.min} to {partition.left.max}
          </button>
          <button type="button" className="primary-btn" onClick={() => void handleSelection("right")}>
            {partition.right.min} to {partition.right.max}
          </button>
          <button type="button" className="ghost-btn" onClick={() => void beginGame()}>
            Restart
          </button>
        </div>
      )}

      {inputError && <p className="error">{inputError}</p>}

      <div className={`feedback-banner ${feedbackTone}`}>{feedback}</div>

      {gameState === "won" && target !== null && (
        <div className="result-box">
          <h2>Result</h2>
          <p>Hidden number: {target}</p>
          <p>Selections used: {selections}</p>
          <p>Optimal selections: {optimalSelections}</p>
          <p>Performance: {getPerformanceLabel(selections - optimalSelections)}</p>
          {timerMode && <p>Elapsed time: {elapsedSeconds}s</p>}
          <p className="meta-text">Game ID: {RANGE_NARROWING_GAME_ID}</p>
        </div>
      )}

      <div className="leaderboard">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 && <p className="meta-text">No leaderboard entries yet.</p>}
        {leaderboard.length > 0 && (
          <ol>
            {leaderboard.map((entry) => (
              <li key={entry.uid}>
                {entry.uid.slice(0, 6)}... - {entry.bestSelections} ({getPerformanceLabel(entry.delta)})
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
