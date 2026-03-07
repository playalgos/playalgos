import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BinarySearchRunnerPage } from "./BinarySearchRunnerPage";

describe("BinarySearchRunnerPage", () => {
  it("renders idle state", () => {
    render(<BinarySearchRunnerPage />);
    expect(screen.getByRole("button", { name: "Start Run" })).toBeInTheDocument();
    expect(screen.getByText(/Press start to begin/i)).toBeInTheDocument();
  });

  it("starts and processes a decision", () => {
    render(<BinarySearchRunnerPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start Run" }));

    expect(screen.getByRole("button", { name: /Up: Found/i })).toBeInTheDocument();
    expect(screen.getByText(/Decisions: 0/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Left: Lower Half/i }));
    expect(screen.getByText(/Decisions: 1/i)).toBeInTheDocument();
  });
});
