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
  const [guessHistory, setGuessHistory] = useState<Array<{ guess: number; outcome: "too-low" | "too-high" | "correct" }>>([]);
  const [feedback, setFeedback] = useState<string>("Start game to make your first guess.");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [inputError, setInputError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bestAttempts, setBestAttempts] = useState<number | null>(null);
  const [bestDelta, setBestDelta] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; bestAttempts: number; delta: number }>>([]);

  const [timerMode, setTimerMode] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [finalTimeSeconds, setFinalTimeSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (gameState !== "playing" || !timerMode || startedAtMs === null) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [gameState, timerMode, startedAtMs]);

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
    setGuessHistory([]);
    setElapsedSeconds(0);
    setStartedAtMs(Date.now());
    setFinalTimeSeconds(null);
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
    setGuessHistory((prev) => [...prev, { guess, outcome: result!.outcome }]);

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
    setStartedAtMs(null);
    setFinalTimeSeconds(elapsedSeconds);
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

      <div className="mode-controls" style={{ marginBottom: "20px" }}>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={timerMode}
            onChange={(event) => setTimerMode(event.target.checked)}
            disabled={gameState === "playing"}
          />
          Timer mode
        </label>
      </div>

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
        {timerMode && (
          <div className="stat-card">
            <div className="stat-label">Elapsed</div>
            <div className="stat-value">{gameState === "won" ? `${finalTimeSeconds ?? 0}s` : `${elapsedSeconds}s`}</div>
          </div>
        )}
      </div>

      {gameState !== "playing" && (
        <button type="button" className="primary-btn" onClick={() => void beginGame()}>
          {gameState === "won" ? "Play Again" : "Start Game"}
        </button>
      )}

      {(gameState === "playing" || gameState === "won") && guessHistory.length > 0 && (
        <div className="range-board" style={{ margin: "20px 0", textAlign: "center", background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
          <h2>Search Progress {gameState === "playing" && " (Click graph to guess)"}</h2>
          <svg 
            viewBox={`0 0 600 ${140 + guessHistory.length * 20}`} 
            style={{ maxWidth: "100%", height: "auto", cursor: gameState === "playing" ? "crosshair" : "default" }}
            onClick={(e) => {
              if (gameState !== "playing") return;
              const svg = e.currentTarget;
              const pt = svg.createSVGPoint();
              pt.x = e.clientX;
              pt.y = e.clientY;
              const svgP = pt.matrixTransform(svg.getScreenCTM()!.inverse());
              if (svgP.x >= 20 && svgP.x <= 580) {
                const span = RANGE_MAX - RANGE_MIN;
                const ratio = (svgP.x - 20) / 560;
                const guessVal = Math.round(RANGE_MIN + ratio * span);
                setInput(String(Math.max(RANGE_MIN, Math.min(RANGE_MAX, guessVal))));
              }
            }}
            role={gameState === "playing" ? "button" : "img"}
            aria-label="Interactive number line for visual guessing"
          >
            {/* Background full range track */}
            <rect x="20" y="55" width="560" height="10" rx="5" fill="#e2e8f0" />
            <text x="20" y="45" fontSize="12" fill="#64748b" textAnchor="middle">{RANGE_MIN}</text>
            <text x="580" y="45" fontSize="12" fill="#64748b" textAnchor="middle">{RANGE_MAX}</text>
            
            {(() => {
              const span = RANGE_MAX - RANGE_MIN;
              if (span <= 0) return null;
              
              const historyElems = guessHistory.map((item, i) => {
                const ratio = (item.guess - RANGE_MIN) / span;
                const cx = 20 + ratio * 560;
                let color = "#cbd5e1";
                if (item.outcome === "too-low") color = "#3b82f6"; // blue for too low
                if (item.outcome === "too-high") color = "#ef4444"; // red for too high
                if (item.outcome === "correct") color = "#10b981"; // green for correct
                
                const yOffset = i % 2 === 0 ? 30 : 90; // Stagger text
                
                return (
                  <g key={`${item.guess}-${i}`}>
                    <line x1={cx} y1="55" x2={cx} y2={yOffset === 30 ? 40 : 80} stroke={color} strokeWidth="1" />
                    <circle cx={cx} cy="60" r="6" fill={color} />
                    <text x={cx} y={yOffset} fontSize="11" fill={color} textAnchor="middle" fontWeight="bold">{item.guess}</text>
                  </g>
                );
              });
              
              const tornadoElems = [];
              let curMin = RANGE_MIN;
              let curMax = RANGE_MAX;
              tornadoElems.push({ min: curMin, max: curMax });
              guessHistory.forEach(item => {
                if (item.outcome === "too-low" && item.guess >= curMin) curMin = item.guess + 1;
                if (item.outcome === "too-high" && item.guess <= curMax) curMax = item.guess - 1;
                tornadoElems.push({ 
                  min: Math.min(RANGE_MAX, Math.max(RANGE_MIN, curMin)), 
                  max: Math.max(RANGE_MIN, Math.min(RANGE_MAX, curMax)) 
                });
              });
              
              const tornadoRender = tornadoElems.map((r, idx) => {
                const rStart = (r.min - RANGE_MIN) / span;
                const rEnd = (r.max - RANGE_MIN) / span;
                return (
                  <rect 
                    key={`tornado-${idx}`}
                    x={20 + rStart * 560} 
                    y={120 + idx * 20} 
                    width={Math.max(2, (rEnd - rStart) * 560)} 
                    height="14" 
                    rx="4" 
                    fill="#38bdf8" 
                    fillOpacity={Math.max(0.1, 0.8 - idx * 0.15)} 
                  />
                );
              });
              
              let activeHighlight = null;
              if (gameState === "playing" && curMin <= curMax) {
                const ratioStart = (curMin - RANGE_MIN) / span;
                const ratioEnd = (curMax - RANGE_MIN) / span;
                activeHighlight = (
                  <rect 
                    x={20 + ratioStart * 560} 
                    y="53" 
                    width={Math.max(2, (ratioEnd - ratioStart) * 560)} 
                    height="14" 
                    rx="4" 
                    fill="none" 
                    stroke="#0284c7" 
                    strokeWidth="2" 
                    strokeDasharray="4 2" 
                  />
                );
              }

              return (
                <g>
                  {tornadoRender}
                  {activeHighlight}
                  {historyElems}
                </g>
              );
            })()}

            {/* Hint for click-to-guess */}
            {gameState === "playing" && (
              <text x="300" y="105" fontSize="12" fill="#94a3b8" textAnchor="middle" fontStyle="italic">
                Click graph to adjust input
              </text>
            )}
          </svg>
        </div>
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
