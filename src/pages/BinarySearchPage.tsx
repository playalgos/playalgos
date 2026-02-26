import { FormEvent, useEffect, useMemo, useState } from "react";
import { auth } from "../firebase/client";
import {
  getLeaderboard,
  getBestScore,
  startSession,
  submitGuess
} from "../firebase/binarySearchStore";
import {
  GAME_ID,
  getOptimalAttempts,
  getPerformanceLabel,
  parseGuess,
  RANGE_MAX,
  RANGE_MIN
} from "../games/binarySearch";

type GameState = "idle" | "playing" | "won";
type FeedbackTone = "neutral" | "low" | "high" | "correct";

export function BinarySearchPage() {
  const uid = auth?.currentUser?.uid ?? null;
  const optimalAttempts = useMemo(() => getOptimalAttempts(RANGE_MIN, RANGE_MAX), []);

  const [target, setTarget] = useState<number | null>(null);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [input, setInput] = useState<string>("");
  const [attempts, setAttempts] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("Start game to make your first guess.");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [inputError, setInputError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bestAttempts, setBestAttempts] = useState<number | null>(null);
  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestAttempts: number; delta: number }>>([]);

  useEffect(() => {
    if (!uid) return;

    void (async () => {
      try {
        const best = await getBestScore(uid);
        if (best) {
          setBestAttempts(best.bestAttempts);
          setBestDelta(best.delta);
        }
      } catch {
        // Keep gameplay available even if reads fail.
      }
    })();
  }, [uid]);

  useEffect(() => {
    void (async () => {
      try {
        const entries = await getLeaderboard(5);
        setLeaderboard(entries);
      } catch {
        setLeaderboard([]);
      }
    })();
  }, []);

  async function beginGame(): Promise<void> {
    setTarget(null);
    setInput("");
    setInputError("");
    setAttempts(0);
    setFeedback(`Game started. Guess a number between ${RANGE_MIN} and ${RANGE_MAX}.`);
    setFeedbackTone("neutral");
    setGameState("playing");

    if (!uid) {
      setSessionId(null);
      return;
    }

    try {
      const id = await startSession({
        rangeMin: RANGE_MIN,
        rangeMax: RANGE_MAX
      });
      setSessionId(id);
    } catch {
      setSessionId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (gameState !== "playing") return;

    const parsed = parseGuess(input, RANGE_MIN, RANGE_MAX);
    if (parsed.value === null) {
      setInputError(parsed.error);
      return;
    }

    setInputError("");
    const guess = parsed.value;
    if (!sessionId) {
      setInputError("No active session. Start a new game.");
      return;
    }

    let result:
      | {
          outcome: "too-low" | "too-high" | "correct";
          attempts: number;
          status: "playing" | "won";
          target?: number;
          optimalAttempts?: number;
          delta?: number;
          bestUpdated?: boolean;
        }
      | null = null;

    try {
      result = await submitGuess({ sessionId, guess });
    } catch (error: unknown) {
      setInputError(error instanceof Error ? error.message : "Could not submit guess.");
      return;
    }

    setAttempts(result.attempts);

    if (result.outcome === "too-low") {
      setFeedback("Too low.");
      setFeedbackTone("low");
      setInput("");
      return;
    }

    if (result.outcome === "too-high") {
      setFeedback("Too high.");
      setFeedbackTone("high");
      setInput("");
      return;
    }

    setGameState("won");
    setFeedback("Correct.");
    setFeedbackTone("correct");
    setTarget(result.target ?? null);
    setInput("");

    if (result.bestUpdated && typeof result.delta === "number") {
      setBestAttempts(result.attempts);
      setBestDelta(result.delta);
    }

    void (async () => {
      try {
        const entries = await getLeaderboard(5);
        setLeaderboard(entries);
      } catch {
        // Keep UI running even if leaderboard refresh fails.
      }
    })();
  }

  return (
    <section>
      <h1>Binary Search Guessing</h1>
      <p className="subtitle">
        Guess a hidden number between {RANGE_MIN} and {RANGE_MAX} in the fewest possible steps.
      </p>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Optimal Attempts</div>
          <div className="stat-value">{optimalAttempts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Attempts Used</div>
          <div className="stat-value">{attempts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best Score</div>
          <div className="stat-value">
            {bestAttempts === null ? "No record" : `${bestAttempts} (${getPerformanceLabel(bestDelta ?? 0)})`}
          </div>
        </div>
      </div>

      {gameState !== "playing" && (
        <button type="button" className="primary-btn" onClick={() => void beginGame()}>
          {gameState === "won" ? "Play Again" : "Start Game"}
        </button>
      )}

      {gameState === "playing" && (
        <form className="guess-form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="guess">Your Guess</label>
          <div className="guess-input-row">
            <input
              id="guess"
              type="number"
              min={RANGE_MIN}
              max={RANGE_MAX}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Enter ${RANGE_MIN}-${RANGE_MAX}`}
            />
            <button type="submit" className="primary-btn">
              Submit
            </button>
            <button type="button" className="ghost-btn" onClick={() => void beginGame()}>
              Restart
            </button>
          </div>
          {inputError && <p className="error">{inputError}</p>}
        </form>
      )}

      <div className={`feedback-banner ${feedbackTone}`}>{feedback}</div>

      {gameState === "won" && (
        <div className="result-box">
          <h2>Result</h2>
          <p>Hidden number: {target ?? "N/A"}</p>
          <p>Attempts used: {attempts}</p>
          <p>Optimal attempts: {optimalAttempts}</p>
          <p>Performance: {getPerformanceLabel(attempts - optimalAttempts)}</p>
          <p className="meta-text">Game ID: {GAME_ID}</p>
        </div>
      )}

      <div className="leaderboard">
        <h2>Leaderboard</h2>
        {leaderboard.length === 0 && <p className="meta-text">No leaderboard entries yet.</p>}
        {leaderboard.length > 0 && (
          <ol>
            {leaderboard.map((entry) => (
              <li key={entry.uid}>
                {entry.uid.slice(0, 6)}... - {entry.bestAttempts} ({getPerformanceLabel(entry.delta)})
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
