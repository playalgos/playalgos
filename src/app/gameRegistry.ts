export type GameMeta = {
  id: string;
  title: string;
  description: string;
  route: string;
  status: "ready" | "coming-soon";
};

export const games: GameMeta[] = [
  {
    id: "binary-search-runner",
    title: "Binary Search Runner",
    description: "Dino-style endless runner where each obstacle is a binary search decision.",
    route: "/games/binary-search-runner",
    status: "ready"
  },
  {
    id: "binary-search",
    title: "Binary Search Guessing",
    description: "Guess the hidden number with as few steps as possible.",
    route: "/games/binary-search",
    status: "ready"
  },
  {
    id: "range-narrowing",
    title: "Range Narrowing Challenge",
    description: "Narrow the interval by selecting halves until one number remains.",
    route: "/games/range-narrowing",
    status: "ready"
  },
  {
    id: "quick-sort-pivot",
    title: "Quick Sort Pivot Game",
    description: "Choose pivots and partition each subarray to complete quick sort.",
    route: "/games/quick-sort-pivot",
    status: "ready"
  },
  {
    id: "knapsack-treasure-bag",
    title: "Knapsack (Treasure Bag)",
    description: "Choose items to maximize value while staying under the bag capacity.",
    route: "/games/knapsack-treasure-bag",
    status: "ready"
  },
  {
    id: "dijkstra-path-strategy",
    title: "Dijkstra (Path Strategy)",
    description: "Lock nodes in minimum-distance order to reach the shortest path target.",
    route: "/games/dijkstra-path-strategy",
    status: "ready"
  }
];
