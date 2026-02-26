import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuickSortPivotPage } from "./QuickSortPivotPage";

const quickStoreMock = vi.hoisted(() => ({
  getQuickSortBestScore: vi.fn(),
  getQuickSortLeaderboard: vi.fn(),
  startQuickSortSession: vi.fn(),
  submitQuickSortPartition: vi.fn()
}));

vi.mock("../firebase/client", () => ({
  auth: { currentUser: { uid: "user-1" } }
}));

vi.mock("../firebase/quickSortPivotStore", () => quickStoreMock);

describe("QuickSortPivotPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    quickStoreMock.getQuickSortBestScore.mockResolvedValue(null);
    quickStoreMock.getQuickSortLeaderboard.mockResolvedValue([]);
    quickStoreMock.startQuickSortSession.mockResolvedValue({
      sessionId: "qs-session-1",
      array: [4, 2, 7, 1],
      stack: [{ low: 0, high: 3 }],
      roundsCompleted: 0,
      invalidSubmits: 0,
      moves: 0,
      isComplete: false
    });
  });

  it("renders idle state", () => {
    render(<QuickSortPivotPage />);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
    expect(screen.getByText(/Start game to begin partitioning/i)).toBeInTheDocument();
  });

  it("enters playing state after start", async () => {
    render(<QuickSortPivotPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));

    await waitFor(() => expect(quickStoreMock.startQuickSortSession).toHaveBeenCalledWith(8));
    expect(screen.getByText(/Active subarray: index 0 to 3/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Partition" })).toBeInTheDocument();
  });

  it("shows validation feedback when submitting without selecting pivot", async () => {
    render(<QuickSortPivotPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(quickStoreMock.startQuickSortSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Submit Partition" }));
    expect(screen.getByText(/Select a pivot first/i)).toBeInTheDocument();
  });

  it("handles invalid partition response", async () => {
    quickStoreMock.submitQuickSortPartition.mockResolvedValue({
      accepted: false,
      accuracy: 0.5,
      balanceScore: 0.2,
      invalidDetails: {
        missingIndices: [3],
        duplicateIndices: [],
        outOfRangeIndices: [],
        misplacedLeftIndices: [2],
        misplacedRightIndices: []
      },
      state: {
        array: [4, 2, 7, 1],
        stack: [{ low: 0, high: 3 }],
        roundsCompleted: 0,
        invalidSubmits: 1,
        moves: 2,
        isComplete: false
      }
    });

    render(<QuickSortPivotPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(quickStoreMock.startQuickSortSession).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("index 0"));
    fireEvent.click(screen.getAllByRole("button", { name: "Left" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Right" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Left" })[2]);
    fireEvent.click(screen.getByRole("button", { name: "Submit Partition" }));

    await waitFor(() => expect(quickStoreMock.submitQuickSortPartition).toHaveBeenCalled());
    expect(screen.getByText(/Invalid partition\. Accuracy 50%/i)).toBeInTheDocument();
  });

  it("transitions to won state on accepted final partition", async () => {
    quickStoreMock.submitQuickSortPartition.mockResolvedValue({
      accepted: true,
      accuracy: 1,
      balanceScore: 0.8,
      invalidDetails: null,
      state: {
        array: [1, 2, 4, 7],
        stack: [],
        roundsCompleted: 3,
        invalidSubmits: 0,
        moves: 4,
        isComplete: true
      },
      totalCost: 7,
      baselineCost: 3,
      delta: 4,
      bestUpdated: true
    });

    render(<QuickSortPivotPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() => expect(quickStoreMock.startQuickSortSession).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle("index 0"));
    fireEvent.click(screen.getAllByRole("button", { name: "Left" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Right" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Left" })[2]);
    fireEvent.click(screen.getByRole("button", { name: "Submit Partition" }));

    await waitFor(() => expect(quickStoreMock.submitQuickSortPartition).toHaveBeenCalled());
    expect(screen.getByText(/Sorted successfully\. Quick Sort complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Sorted array: 1, 2, 4, 7/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Again" })).toBeInTheDocument();
  });
});
