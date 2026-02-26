import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RangeNarrowingPage } from "./RangeNarrowingPage";

const rangeStoreMock = vi.hoisted(() => ({
  getRangeBestScore: vi.fn(),
  getRangeLeaderboard: vi.fn(),
  startRangeSession: vi.fn(),
  submitRangeSelection: vi.fn()
}));

vi.mock("../firebase/client", () => ({
  auth: { currentUser: { uid: "user-1" } }
}));

vi.mock("../firebase/rangeNarrowingStore", () => rangeStoreMock);

describe("RangeNarrowingPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rangeStoreMock.getRangeBestScore.mockResolvedValue(null);
    rangeStoreMock.getRangeLeaderboard.mockResolvedValue([]);
    rangeStoreMock.startRangeSession.mockResolvedValue({
      sessionId: "range-session-1",
      currentMin: 1,
      currentMax: 100
    });
  });

  it("renders idle state", () => {
    render(<RangeNarrowingPage />);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    expect(screen.getByText(/Start game to begin narrowing/i)).toBeInTheDocument();
  });

  it("enters playing state after starting game", async () => {
    render(<RangeNarrowingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));

    await waitFor(() => expect(rangeStoreMock.startRangeSession).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "1 to 50" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "51 to 100" })).toBeInTheDocument();
    expect(screen.getByText(/Game started/i)).toBeInTheDocument();
  });

  it("increments selection count and shows inside feedback", async () => {
    rangeStoreMock.submitRangeSelection.mockResolvedValue({
      outcome: "inside-selected-range",
      status: "playing",
      selections: 1,
      currentMin: 1,
      currentMax: 50
    });

    render(<RangeNarrowingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(rangeStoreMock.startRangeSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "1 to 50" }));

    await waitFor(() => {
      expect(rangeStoreMock.submitRangeSelection).toHaveBeenCalledWith({
        sessionId: "range-session-1",
        selected: "left"
      });
    });

    expect(screen.getByText(/Selections Used/i)).toBeInTheDocument();
    expect(screen.getByText(/Inside selected range/i)).toBeInTheDocument();
  });

  it("transitions to won state on correct resolution", async () => {
    rangeStoreMock.submitRangeSelection.mockResolvedValue({
      outcome: "correct",
      status: "won",
      selections: 7,
      currentMin: 42,
      currentMax: 42,
      target: 42,
      optimalSelections: 7,
      delta: 0,
      bestUpdated: true
    });

    render(<RangeNarrowingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(rangeStoreMock.startRangeSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "1 to 50" }));

    await waitFor(() => {
      expect(rangeStoreMock.submitRangeSelection).toHaveBeenCalled();
    });

    expect(screen.getByText(/Resolved. The hidden number is 42/i)).toBeInTheDocument();
    expect(screen.getByText(/Hidden number: 42/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
  });
});
