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
        <div style={{ margin: "16px 0", textAlign: "center", background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", position: "relative", height: "180px" }}>
          <svg viewBox="0 0 800 150" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
            {/* Ground */}
            <rect x="0" y="100" width="800" height="50" fill="#e2e8f0" />
            
            {/* Runner */}
            <g transform="translate(100, 50)">
               <circle cx="20" cy="15" r="15" fill="#0ea5e9" />
               <rect x="15" y="30" width="10" height="20" fill="#0ea5e9" rx="3" />
            </g>

            {/* Checkpoint & Doors moving progressively leftwards */}
            <g transform={`translate(${150 + (progress / 100) * 600}, 15)`}>
               {/* Checkpoint Sign */}
               <rect x="0" y="0" width="6" height="85" fill="#94a3b8" />
               <rect x="-42" y="-15" width="90" height="25" fill="#3b82f6" rx="4" />
               <text x="3" y="2" fill="white" fontSize="12" textAnchor="middle" fontWeight="bold">CHKPT</text>
               
               {/* 3 Doors (Lower, Equal, Upper) */}
               <g transform="translate(-100, 30)">
                 {/* Lower Half Door */}
                 <rect x="0" y="0" width="40" height="55" rx="4" fill="#bae6fd" stroke="#0ea5e9" strokeWidth="2" />
                 <text x="20" y="25" fontSize="16" fill="#0284c7" textAnchor="middle" fontWeight="bold">{'<'}</text>
                 <text x="20" y="45" fontSize="10" fill="#0284c7" textAnchor="middle" fontWeight="bold">{round.mid}</text>
                 
                 {/* Found Door */}
                 <rect x="60" y="0" width="40" height="55" rx="4" fill="#a7f3d0" stroke="#10b981" strokeWidth="2" />
                 <text x="80" y="25" fontSize="16" fill="#047857" textAnchor="middle" fontWeight="bold">{'='}</text>
                 <text x="80" y="45" fontSize="10" fill="#047857" textAnchor="middle" fontWeight="bold">{round.mid}</text>

                 {/* Upper Half Door */}
                 <rect x="120" y="0" width="40" height="55" rx="4" fill="#fed7aa" stroke="#f97316" strokeWidth="2" />
                 <text x="140" y="25" fontSize="16" fill="#c2410c" textAnchor="middle" fontWeight="bold">{'>'}</text>
                 <text x="140" y="45" fontSize="10" fill="#c2410c" textAnchor="middle" fontWeight="bold">{round.mid}</text>
               </g>
            </g>
          </svg>
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
