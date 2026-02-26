import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/dom";
import { KnapsackTreasurePage } from "./KnapsackTreasurePage";

const knapsackStoreMock = vi.hoisted(() => ({
  getKnapsackBestScore: vi.fn(),
  getKnapsackLeaderboard: vi.fn(),
  startKnapsackSessionWithOptions: vi.fn(),
  submitKnapsackSelection: vi.fn()
}));

vi.mock("../firebase/client", () => ({
  auth: { currentUser: { uid: "user-1" } }
}));

vi.mock("../firebase/knapsackTreasureStore", () => knapsackStoreMock);

describe("KnapsackTreasurePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    knapsackStoreMock.getKnapsackBestScore.mockResolvedValue(null);
    knapsackStoreMock.getKnapsackLeaderboard.mockResolvedValue([]);
    knapsackStoreMock.startKnapsackSessionWithOptions.mockResolvedValue({
      sessionId: "knapsack-1",
      capacity: 10,
      items: [
        { id: "a-item", weight: 3, value: 6 },
        { id: "b-item", weight: 4, value: 7 },
        { id: "c-item", weight: 6, value: 10 }
      ],
      submitAttempts: 0,
      mode: "learn",
      dailyKey: null,
      status: "playing"
    });
  });

  it("renders idle state", () => {
    render(<KnapsackTreasurePage />);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    expect(screen.getByText(/Start game to build your treasure bag/i)).toBeInTheDocument();
  });

  it("starts session with selected mode options", async () => {
    render(<KnapsackTreasurePage />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "challenge" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Daily seed challenge/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));

    await waitFor(() => expect(knapsackStoreMock.startKnapsackSessionWithOptions).toHaveBeenCalled());
    const calledWith = knapsackStoreMock.startKnapsackSessionWithOptions.mock.calls[0][0];
    expect(calledWith.mode).toBe("challenge");
    expect(typeof calledWith.dailyKey).toBe("string");
  });

  it("shows overweight feedback on invalid submit", async () => {
    knapsackStoreMock.submitKnapsackSelection.mockResolvedValue({
      status: "playing",
      mode: "learn",
      dailyKey: null,
      submitAttempts: 1,
      isValid: false,
      usedWeight: 13,
      selectedValue: 23,
      selectedCount: 3,
      overweightBy: 3,
      duplicateIndices: [],
      outOfRangeIndices: [],
      optimalValue: 17,
      efficiency: 1.35,
      delta: -6
    });

    render(<KnapsackTreasurePage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(knapsackStoreMock.startKnapsackSessionWithOptions).toHaveBeenCalled());

    const rowA = screen.getByRole("row", { name: /A Item/i });
    const rowB = screen.getByRole("row", { name: /B Item/i });
    const rowC = screen.getByRole("row", { name: /C Item/i });
    fireEvent.click(within(rowA).getByRole("button", { name: "Add" }));
    fireEvent.click(within(rowB).getByRole("button", { name: "Add" }));
    fireEvent.click(within(rowC).getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Bag" }));

    await waitFor(() => expect(knapsackStoreMock.submitKnapsackSelection).toHaveBeenCalled());
    expect(screen.getByText(/Over capacity by 3/i)).toBeInTheDocument();
  });

  it("transitions to won state with optimal explanation", async () => {
    knapsackStoreMock.submitKnapsackSelection.mockResolvedValue({
      status: "won",
      mode: "learn",
      dailyKey: null,
      submitAttempts: 2,
      isValid: true,
      usedWeight: 7,
      selectedValue: 13,
      selectedCount: 2,
      overweightBy: 0,
      duplicateIndices: [],
      outOfRangeIndices: [],
      optimalValue: 17,
      efficiency: 13 / 17,
      delta: 4,
      bestUpdated: true
    });

    render(<KnapsackTreasurePage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(knapsackStoreMock.startKnapsackSessionWithOptions).toHaveBeenCalled());

    const rowA = screen.getByRole("row", { name: /A Item/i });
    const rowB = screen.getByRole("row", { name: /B Item/i });
    fireEvent.click(within(rowA).getByRole("button", { name: "Add" }));
    fireEvent.click(within(rowB).getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Bag" }));

    await waitFor(() => expect(knapsackStoreMock.submitKnapsackSelection).toHaveBeenCalled());
    expect(screen.getByText(/Bag locked\. Round complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Optimal Set Explanation/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
  });
});
