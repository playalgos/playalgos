import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DijkstraPathStrategyPage } from "./DijkstraPathStrategyPage";

const dijkstraStoreMock = vi.hoisted(() => ({
  getDijkstraBestScore: vi.fn(),
  getDijkstraLeaderboard: vi.fn(),
  startDijkstraSession: vi.fn(),
  submitDijkstraLock: vi.fn()
}));

vi.mock("../firebase/client", () => ({
  auth: { currentUser: { uid: "user-1" } }
}));

vi.mock("../firebase/dijkstraPathStrategyStore", () => dijkstraStoreMock);

describe("DijkstraPathStrategyPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dijkstraStoreMock.getDijkstraBestScore.mockResolvedValue(null);
    dijkstraStoreMock.getDijkstraLeaderboard.mockResolvedValue([]);
    dijkstraStoreMock.startDijkstraSession.mockResolvedValue({
      sessionId: "dij-1",
      scenarioId: "city-1",
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
      },
      startId: "A",
      targetId: "D",
      distances: { A: 0, B: Number.POSITIVE_INFINITY, C: Number.POSITIVE_INFINITY, D: Number.POSITIVE_INFINITY },
      previous: { A: null, B: null, C: null, D: null },
      lockedOrder: [],
      validLocks: 0,
      invalidLocks: 0,
      status: "playing"
    });
  });

  it("renders idle state", () => {
    render(<DijkstraPathStrategyPage />);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    expect(screen.getByText(/Start game to begin path strategy/i)).toBeInTheDocument();
  });

  it("enters playing state after start", async () => {
    render(<DijkstraPathStrategyPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(dijkstraStoreMock.startDijkstraSession).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Hint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show Distances/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock A" })).toBeInTheDocument();
    expect(screen.getAllByText("d=?").length).toBeGreaterThan(0);
  });

  it("reveals tentative distances only after assist is enabled", async () => {
    render(<DijkstraPathStrategyPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(dijkstraStoreMock.startDijkstraSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Show Distances/i }));

    expect(screen.getByText("d=0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distances Visible" })).toBeDisabled();
  });

  it("shows invalid lock feedback", async () => {
    dijkstraStoreMock.submitDijkstraLock.mockResolvedValue({
      accepted: false,
      reason: "not-frontier-min",
      candidateMinNodes: ["A"],
      sessionId: "dij-1",
      scenarioId: "city-1",
      graph: {
        nodes: ["A", "B", "C", "D"],
        adjacency: { A: [], B: [], C: [], D: [] }
      },
      startId: "A",
      targetId: "D",
      distances: { A: 0, B: Number.POSITIVE_INFINITY, C: Number.POSITIVE_INFINITY, D: Number.POSITIVE_INFINITY },
      previous: { A: null, B: null, C: null, D: null },
      lockedOrder: [],
      validLocks: 0,
      invalidLocks: 1,
      status: "playing"
    });

    render(<DijkstraPathStrategyPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(dijkstraStoreMock.startDijkstraSession).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Lock B" }));
    await waitFor(() => expect(dijkstraStoreMock.submitDijkstraLock).toHaveBeenCalled());

    expect(screen.getByText(/Invalid lock for B/i)).toBeInTheDocument();
  });

  it("transitions to won state when target solved", async () => {
    dijkstraStoreMock.submitDijkstraLock.mockResolvedValue({
      accepted: true,
      reason: "ok",
      candidateMinNodes: ["D"],
      sessionId: "dij-1",
      scenarioId: "city-1",
      graph: {
        nodes: ["A", "B", "C", "D"],
        adjacency: { A: [], B: [], C: [], D: [] }
      },
      startId: "A",
      targetId: "D",
      distances: { A: 0, B: 2, C: 3, D: 4 },
      previous: { A: null, B: "A", C: "B", D: "C" },
      lockedOrder: ["A", "B", "C", "D"],
      validLocks: 4,
      invalidLocks: 0,
      status: "won",
      targetDistance: 4,
      optimalDistance: 4,
      delta: 0,
      bestCost: 0,
      bestUpdated: true
    });

    render(<DijkstraPathStrategyPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(dijkstraStoreMock.startDijkstraSession).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Lock D" }));
    await waitFor(() => expect(dijkstraStoreMock.submitDijkstraLock).toHaveBeenCalled());

    expect(screen.getByText(/Round Complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Target distance \(player vs optimal\): 4 vs 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Performance delta: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/Score cost: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/Valid locks: 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Invalid locks: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/Player path: A -> B -> C -> D/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
  });
});
