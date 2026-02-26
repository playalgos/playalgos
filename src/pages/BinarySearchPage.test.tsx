import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BinarySearchPage } from "./BinarySearchPage";

const storeMock = vi.hoisted(() => ({
  getBestScore: vi.fn(),
  getLeaderboard: vi.fn(),
  startSession: vi.fn(),
  submitGuess: vi.fn()
}));

vi.mock("../firebase/client", () => ({
  auth: { currentUser: { uid: "user-1" } }
}));

vi.mock("../firebase/binarySearchStore", () => storeMock);

describe("BinarySearchPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storeMock.getBestScore.mockResolvedValue(null);
    storeMock.getLeaderboard.mockResolvedValue([]);
    storeMock.startSession.mockResolvedValue("session-1");
  });

  it("renders idle state", async () => {
    render(<BinarySearchPage />);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    expect(screen.getByText(/Start game to make your first guess/i)).toBeInTheDocument();
  });

  it("enters playing state after starting game", async () => {
    render(<BinarySearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));

    await waitFor(() => {
      expect(storeMock.startSession).toHaveBeenCalled();
    });
    expect(screen.getByLabelText("Your Guess")).toBeInTheDocument();
    expect(screen.getByText(/Game started/i)).toBeInTheDocument();
  });

  it("transitions to won state on correct guess", async () => {
    storeMock.submitGuess.mockResolvedValue({
      outcome: "correct",
      attempts: 4,
      status: "won",
      target: 64,
      optimalAttempts: 7,
      delta: -3,
      bestUpdated: true
    });

    render(<BinarySearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));

    await waitFor(() => expect(storeMock.startSession).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Your Guess"), { target: { value: "64" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(storeMock.submitGuess).toHaveBeenCalledWith({
        sessionId: "session-1",
        guess: 64
      });
    });

    expect(screen.getByText("Correct.")).toBeInTheDocument();
    expect(screen.getByText(/Hidden number: 64/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
  });
});
