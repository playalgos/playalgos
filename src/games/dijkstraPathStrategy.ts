export const DIJKSTRA_PATH_STRATEGY_GAME_ID = "dijkstra-path-strategy";

export type WeightedEdge = {
  to: string;
  weight: number;
};

export type WeightedGraph = {
  nodes: string[];
  adjacency: Record<string, WeightedEdge[]>;
};

export type DijkstraState = {
  graph: WeightedGraph;
  startId: string;
  distances: Record<string, number>;
  previous: Record<string, string | null>;
  lockedOrder: string[];
  lastLocked: string | null;
};

export type LockValidation = {
  isValid: boolean;
  reason: "ok" | "already-locked" | "unknown-node" | "not-frontier-min";
  candidateMinNodes: string[];
  candidateMinDistance: number;
};

export type LockStepResult = {
  state: DijkstraState;
  accepted: boolean;
  validation: LockValidation;
};

export type DijkstraSolveResult = {
  distances: Record<string, number>;
  previous: Record<string, string | null>;
  lockOrder: string[];
};

export type DijkstraRoundScore = {
  delta: number;
  bestCost: number;
};

function cloneAdjacency(adjacency: Record<string, WeightedEdge[]>): Record<string, WeightedEdge[]> {
  const next: Record<string, WeightedEdge[]> = {};
  Object.entries(adjacency).forEach(([node, edges]) => {
    next[node] = edges.map((edge) => ({ ...edge }));
  });
  return next;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function assertValidGraph(graph: WeightedGraph): void {
  if (graph.nodes.length === 0) {
    throw new Error("Graph must have at least one node.");
  }

  const nodes = sortedUnique(graph.nodes);
  if (nodes.length !== graph.nodes.length) {
    throw new Error("Graph nodes must be unique.");
  }

  const nodeSet = new Set(nodes);
  for (const node of nodes) {
    const edges = graph.adjacency[node] ?? [];
    if (!Array.isArray(edges)) {
      throw new Error(`Adjacency for node '${node}' must be an array.`);
    }
    for (const edge of edges) {
      if (!nodeSet.has(edge.to)) {
        throw new Error(`Edge target '${edge.to}' does not exist in graph.`);
      }
      if (!Number.isFinite(edge.weight) || edge.weight < 0) {
        throw new Error(`Edge '${node} -> ${edge.to}' has invalid weight.`);
      }
    }
  }

  for (const key of Object.keys(graph.adjacency)) {
    if (!nodeSet.has(key)) {
      throw new Error(`Adjacency contains unknown node '${key}'.`);
    }
  }
}

function normalizeGraph(graph: WeightedGraph): WeightedGraph {
  assertValidGraph(graph);
  const nodes = sortedUnique(graph.nodes);
  const adjacency = cloneAdjacency(graph.adjacency);
  for (const node of nodes) {
    if (!adjacency[node]) adjacency[node] = [];
    adjacency[node] = [...adjacency[node]].sort((a, b) => a.to.localeCompare(b.to));
  }
  return { nodes, adjacency };
}

function getLockedSet(state: DijkstraState): Set<string> {
  return new Set(state.lockedOrder);
}

function getMinFrontierCandidates(state: DijkstraState): { nodes: string[]; distance: number } {
  const locked = getLockedSet(state);
  let minDistance = Number.POSITIVE_INFINITY;
  const candidates: string[] = [];

  for (const node of state.graph.nodes) {
    if (locked.has(node)) continue;
    const distance = state.distances[node];
    if (!Number.isFinite(distance)) continue;
    if (distance < minDistance) {
      minDistance = distance;
      candidates.length = 0;
      candidates.push(node);
    } else if (distance === minDistance) {
      candidates.push(node);
    }
  }

  return {
    nodes: candidates.sort((a, b) => a.localeCompare(b)),
    distance: minDistance
  };
}

function cloneState(state: DijkstraState): DijkstraState {
  return {
    graph: state.graph,
    startId: state.startId,
    distances: { ...state.distances },
    previous: { ...state.previous },
    lockedOrder: [...state.lockedOrder],
    lastLocked: state.lastLocked
  };
}

export function createDijkstraState(inputGraph: WeightedGraph, startId: string): DijkstraState {
  const graph = normalizeGraph(inputGraph);
  if (!graph.nodes.includes(startId)) {
    throw new Error(`Start node '${startId}' is not in graph.`);
  }

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  for (const node of graph.nodes) {
    distances[node] = Number.POSITIVE_INFINITY;
    previous[node] = null;
  }
  distances[startId] = 0;

  return {
    graph,
    startId,
    distances,
    previous,
    lockedOrder: [],
    lastLocked: null
  };
}

export function validateLockChoice(state: DijkstraState, nodeId: string): LockValidation {
  if (!state.graph.nodes.includes(nodeId)) {
    return {
      isValid: false,
      reason: "unknown-node",
      candidateMinNodes: [],
      candidateMinDistance: Number.POSITIVE_INFINITY
    };
  }

  const locked = getLockedSet(state);
  if (locked.has(nodeId)) {
    const min = getMinFrontierCandidates(state);
    return {
      isValid: false,
      reason: "already-locked",
      candidateMinNodes: min.nodes,
      candidateMinDistance: min.distance
    };
  }

  const min = getMinFrontierCandidates(state);
  const isValid = min.nodes.includes(nodeId);
  return {
    isValid,
    reason: isValid ? "ok" : "not-frontier-min",
    candidateMinNodes: min.nodes,
    candidateMinDistance: min.distance
  };
}

export function applyLockChoice(
  state: DijkstraState,
  nodeId: string,
  options?: { allowInvalid?: boolean }
): LockStepResult {
  const allowInvalid = options?.allowInvalid ?? false;
  const validation = validateLockChoice(state, nodeId);
  if (!validation.isValid && !allowInvalid) {
    return {
      state: cloneState(state),
      accepted: false,
      validation
    };
  }

  const next = cloneState(state);
  const locked = getLockedSet(next);
  if (!locked.has(nodeId)) {
    next.lockedOrder.push(nodeId);
    next.lastLocked = nodeId;
    locked.add(nodeId);
  }

  const currentDistance = next.distances[nodeId];
  if (Number.isFinite(currentDistance)) {
    for (const edge of next.graph.adjacency[nodeId]) {
      if (locked.has(edge.to)) continue;
      const candidate = currentDistance + edge.weight;
      const existing = next.distances[edge.to];
      if (candidate < existing) {
        next.distances[edge.to] = candidate;
        next.previous[edge.to] = nodeId;
      }
    }
  }

  return {
    state: next,
    accepted: validation.isValid,
    validation
  };
}

export function solveDijkstra(graph: WeightedGraph, startId: string): DijkstraSolveResult {
  let state = createDijkstraState(graph, startId);
  while (true) {
    const min = getMinFrontierCandidates(state);
    if (min.nodes.length === 0 || !Number.isFinite(min.distance)) break;
    const chosen = min.nodes[0];
    state = applyLockChoice(state, chosen).state;
  }

  return {
    distances: state.distances,
    previous: state.previous,
    lockOrder: state.lockedOrder
  };
}

export function buildShortestPath(
  previous: Record<string, string | null>,
  startId: string,
  targetId: string
): string[] | null {
  if (startId === targetId) return [startId];
  if (!(targetId in previous) || !(startId in previous)) return null;

  const path: string[] = [];
  const visited = new Set<string>();
  let current: string | null = targetId;

  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);
    path.push(current);
    if (current === startId) {
      path.reverse();
      return path;
    }
    current = previous[current];
  }
  return null;
}

export function calculateDijkstraRoundScore(
  targetDistance: number,
  optimalDistance: number,
  invalidLocks: number
): DijkstraRoundScore {
  const delta =
    Number.isFinite(targetDistance) && Number.isFinite(optimalDistance)
      ? Math.max(0, targetDistance - optimalDistance)
      : 0;
  return {
    delta,
    bestCost: delta * 10 + Math.max(0, invalidLocks)
  };
}
