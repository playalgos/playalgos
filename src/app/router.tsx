import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./AppShell";
import { HomePage } from "../pages/HomePage";
import { BinarySearchPage } from "../pages/BinarySearchPage";
import { BinarySearchRunnerPage } from "../pages/BinarySearchRunnerPage";
import { RangeNarrowingPage } from "../pages/RangeNarrowingPage";
import { QuickSortPivotPage } from "../pages/QuickSortPivotPage";
import { KnapsackTreasurePage } from "../pages/KnapsackTreasurePage";
import { DijkstraPathStrategyPage } from "../pages/DijkstraPathStrategyPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "games/binary-search", element: <BinarySearchPage /> },
      { path: "games/binary-search-runner", element: <BinarySearchRunnerPage /> },
      { path: "games/range-narrowing", element: <RangeNarrowingPage /> },
      { path: "games/quick-sort-pivot", element: <QuickSortPivotPage /> },
      { path: "games/knapsack-treasure-bag", element: <KnapsackTreasurePage /> },
      { path: "games/dijkstra-path-strategy", element: <DijkstraPathStrategyPage /> }
    ]
  }
]);
