import { describe, expect, it } from "vitest";
import {
  applyLockChoice,
  buildShortestPath,
  calculateDijkstraRoundScore,
  createDijkstraState,
  solveDijkstra,
  validateLockChoice,
  type WeightedGraph
} from "./dijkstraPathStrategy";

describe("dijkstraPathStrategy domain", () => {
  it("computes shortest paths correctly", () => {
    const graph: WeightedGraph = {
      nodes: ["A", "B", "C", "D", "E"],
      adjacency: {
        A: [
          { to: "B", weight: 4 },
          { to: "C", weight: 2 }
        ],
        B: [
          { to: "C", weight: 1 },
          { to: "D", weight: 5 }
        ],
        C: [
          { to: "B", weight: 1 },
          { to: "D", weight: 8 },
          { to: "E", weight: 10 }
        ],
        D: [{ to: "E", weight: 2 }],
        E: []
      }
    };

    const solved = solveDijkstra(graph, "A");
    expect(solved.distances.A).toBe(0);
    expect(solved.distances.B).toBe(3);
    expect(solved.distances.C).toBe(2);
    expect(solved.distances.D).toBe(8);
    expect(solved.distances.E).toBe(10);
    expect(buildShortestPath(solved.previous, "A", "E")).toEqual(["A", "C", "B", "D", "E"]);
  });

  it("handles frontier tie deterministically", () => {
    const graph: WeightedGraph = {
      nodes: ["A", "B", "C", "D"],
      adjacency: {
        A: [
          { to: "B", weight: 1 },
          { to: "C", weight: 1 }
        ],
        B: [{ to: "D", weight: 2 }],
        C: [{ to: "D", weight: 2 }],
        D: []
      }
    };

    const solved = solveDijkstra(graph, "A");
    expect(solved.lockOrder).toEqual(["A", "B", "C", "D"]);
    expect(solved.distances.D).toBe(3);
  });

  it("keeps disconnected nodes unreachable", () => {
    const graph: WeightedGraph = {
      nodes: ["A", "B", "C", "X"],
      adjacency: {
        A: [{ to: "B", weight: 1 }],
        B: [{ to: "C", weight: 2 }],
        C: [],
        X: []
      }
    };

    const solved = solveDijkstra(graph, "A");
    expect(solved.distances.X).toBe(Number.POSITIVE_INFINITY);
    expect(buildShortestPath(solved.previous, "A", "X")).toBeNull();
  });

  it("validates lock choice against minimum frontier distance", () => {
    const graph: WeightedGraph = {
      nodes: ["A", "B", "C"],
      adjacency: {
        A: [
          { to: "B", weight: 2 },
          { to: "C", weight: 5 }
        ],
        B: [{ to: "C", weight: 1 }],
        C: []
      }
    };

    let state = createDijkstraState(graph, "A");
    expect(validateLockChoice(state, "B").isValid).toBe(false);
    expect(validateLockChoice(state, "A").isValid).toBe(true);

    state = applyLockChoice(state, "A").state;
    const invalid = applyLockChoice(state, "C");
    expect(invalid.accepted).toBe(false);
    expect(invalid.validation.reason).toBe("not-frontier-min");
    expect(invalid.state.lockedOrder).toEqual(["A"]);

    const valid = applyLockChoice(state, "B");
    expect(valid.accepted).toBe(true);
    expect(valid.state.lockedOrder).toEqual(["A", "B"]);
    expect(valid.state.distances.C).toBe(3);
  });

  it("rejects unknown or already-locked nodes", () => {
    const graph: WeightedGraph = {
      nodes: ["A", "B"],
      adjacency: {
        A: [{ to: "B", weight: 1 }],
        B: []
      }
    };

    let state = createDijkstraState(graph, "A");
    expect(validateLockChoice(state, "X").reason).toBe("unknown-node");

    state = applyLockChoice(state, "A").state;
    const lockedAgain = validateLockChoice(state, "A");
    expect(lockedAgain.isValid).toBe(false);
    expect(lockedAgain.reason).toBe("already-locked");
    expect(lockedAgain.candidateMinNodes).toEqual(["B"]);
  });

  it("returns not-frontier-min when no reachable frontier nodes remain", () => {
    const graph: WeightedGraph = {
      nodes: ["A", "X"],
      adjacency: {
        A: [],
        X: []
      }
    };

    const state = applyLockChoice(createDijkstraState(graph, "A"), "A").state;
    const validation = validateLockChoice(state, "X");
    expect(validation.isValid).toBe(false);
    expect(validation.reason).toBe("not-frontier-min");
    expect(validation.candidateMinNodes).toEqual([]);
    expect(validation.candidateMinDistance).toBe(Number.POSITIVE_INFINITY);
  });

  it("computes round scoring formula", () => {
    expect(calculateDijkstraRoundScore(7, 7, 0)).toEqual({ delta: 0, bestCost: 0 });
    expect(calculateDijkstraRoundScore(9, 7, 3)).toEqual({ delta: 2, bestCost: 23 });
    expect(calculateDijkstraRoundScore(Number.POSITIVE_INFINITY, 7, 1)).toEqual({ delta: 0, bestCost: 1 });
  });
});
