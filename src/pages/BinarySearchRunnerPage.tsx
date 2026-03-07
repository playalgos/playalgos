import { useEffect, useMemo, useState } from "react";

type Decision = "left" | "right" | "found";
type Phase = "idle" | "running" | "game-over";

type RoundState = {
  values: number[];
  target: number;
  low: number;
  high: number;
  mid: number;
};

const TICK_MS = 120;
const START_LIVES = 3;
const START_PROGRESS = 100;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildRound(level: number): RoundState {
  const size = Math.min(8 * Math.pow(2, Math.floor((level - 1) / 2)), 128);
  const values: number[] = [];
  let current = randomInt(4, 12);

  for (let i = 0; i < size; i += 1) {
    current += randomInt(1, 5);
    values.push(current);
  }

  const targetIndex = randomInt(0, size - 1);
  const low = 0;
  const high = size - 1;
  const mid = Math.floor((low + high) / 2);

  return {
    values,
    target: values[targetIndex],
    low,
    high,
    mid
  };
}

export function BinarySearchRunnerPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [decisions, setDecisions] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(START_PROGRESS);
  const [feedback, setFeedback] = useState("Press start to begin.");
  const [round, setRound] = useState<RoundState>(() => buildRound(1));

  const currentValue = useMemo(() => round.values[round.mid], [round]);

  function startGame(): void {
    setPhase("running");
    setLevel(1);
    setScore(0);
    setCombo(0);
    setLives(START_LIVES);
    setDecisions(0);
    setSpeed(1);
    setProgress(START_PROGRESS);
    setRound(buildRound(1));
    setFeedback("Checkpoint incoming. Choose lower, upper, or found.");
  }

  function loseLife(message: string): void {
    setCombo(0);
    setFeedback(message);
    setProgress(START_PROGRESS);
    setLives((prev) => {
      const next = prev - 1;
      if (next <= 0) {
        setPhase("game-over");
        return 0;
      }
      return next;
    });
  }

  function applyDecision(decision: Decision): void {
    if (phase !== "running") return;

    setDecisions((prev) => prev + 1);

    const midValue = round.values[round.mid];
    const isLeftCorrect = round.target < midValue;
    const isRightCorrect = round.target > midValue;
    const isFoundCorrect = round.target === midValue;

    const isCorrect =
      (decision === "left" && isLeftCorrect) ||
      (decision === "right" && isRightCorrect) ||
      (decision === "found" && isFoundCorrect);

    if (!isCorrect) {
      loseLife("Wrong turn. Obstacle hit.");
      return;
    }

    const nextCombo = combo + 1;
    setCombo(nextCombo);
    setSpeed((prev) => Math.min(prev + 0.08, 4));
    setScore((prev) => prev + 10 + nextCombo * 2);
    setProgress(START_PROGRESS);

    if (decision === "found") {
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setRound(buildRound(nextLevel));
      setFeedback(`Level cleared. Runner speed up for level ${nextLevel}.`);
      return;
    }

    const nextLow = decision === "right" ? round.mid + 1 : round.low;
    const nextHigh = decision === "left" ? round.mid - 1 : round.high;

    if (nextLow > nextHigh) {
      loseLife("Search window collapsed. Obstacle crash.");
      return;
    }

    const nextMid = Math.floor((nextLow + nextHigh) / 2);
    setRound((prev) => ({
      ...prev,
      low: nextLow,
      high: nextHigh,
      mid: nextMid
    }));
    setFeedback("Clean move. Keep narrowing.");
  }

  useEffect(() => {
    if (phase !== "running") return;

    const intervalId = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev - speed * 3.5;
        if (next > 0) return next;
        loseLife("Too slow. Obstacle collision.");
        return START_PROGRESS;
      });
    }, TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [phase, speed]);

  useEffect(() => {
    if (phase !== "running") return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "ArrowLeft") applyDecision("left");
      if (event.key === "ArrowRight") applyDecision("right");
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "f") applyDecision("found");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section>
      <h1>Binary Search Runner</h1>
      <p className="subtitle">
        Dino-style speed run. Left means lower half, right means upper half, up means target found.
      </p>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Level</div>
          <div className="stat-value">{level}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Lives</div>
          <div className="stat-value">{lives}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Score</div>
          <div className="stat-value">{score}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Combo</div>
          <div className="stat-value">{combo}</div>
        </div>
      </div>

      {phase !== "running" && (
        <button type="button" className="primary-btn" onClick={startGame}>
          {phase === "game-over" ? "Restart Run" : "Start Run"}
        </button>
      )}

      <div className="runner-shell" aria-live="polite">
        <div className="runner-track">
          <div className="runner-player">RUNNER</div>
          <div className="runner-obstacle" style={{ left: `${progress}%` }}>
            CHECKPOINT
          </div>
        </div>
        <div className="runner-hud">
          <span>Target: {round.target}</span>
          <span>
            Window: [{round.low}, {round.high}]
          </span>
          <span>
            Mid: {round.mid} ({currentValue})
          </span>
          <span>Decisions: {decisions}</span>
          <span>Speed: {speed.toFixed(2)}x</span>
        </div>
      </div>

      <div className="runner-controls">
        <button type="button" className="ghost-btn" onClick={() => applyDecision("left")} disabled={phase !== "running"}>
          Left: Lower Half
        </button>
        <button type="button" className="ghost-btn" onClick={() => applyDecision("right")} disabled={phase !== "running"}>
          Right: Upper Half
        </button>
        <button type="button" className="primary-btn" onClick={() => applyDecision("found")} disabled={phase !== "running"}>
          Up: Found
        </button>
      </div>

      <div className="feedback-banner">{feedback}</div>

      {phase === "game-over" && (
        <div className="result-box">
          <h2>Run Complete</h2>
          <p>Final score: {score}</p>
          <p>Reached level: {level}</p>
          <p>Total decisions: {decisions}</p>
          <p className="meta-text">Tip: Hit Found only when target equals the current midpoint value.</p>
        </div>
      )}
    </section>
  );
}
