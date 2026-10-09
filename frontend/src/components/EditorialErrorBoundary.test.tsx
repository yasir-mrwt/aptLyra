import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditorialErrorBoundary, { SourceRowErrorBoundary } from "./EditorialErrorBoundary";

function BrokenRow(): never {
  throw new Error("Malformed source retention payload");
}

describe("editorial error boundaries", () => {
  it("isolates a broken source row while keeping the rest of the console visible", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <EditorialErrorBoundary>
        <h1>Editorial review</h1>
        <SourceRowErrorBoundary><BrokenRow /></SourceRowErrorBoundary>
        <p>Other sources remain available</p>
      </EditorialErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "Editorial review" }).textContent).toBe("Editorial review");
    expect(screen.getByRole("alert").textContent).toContain("This source could not be displayed");
    expect(screen.getByText("Other sources remain available").textContent).toBe("Other sources remain available");
    error.mockRestore();
  });

  it("shows a retry state when the whole editorial section fails", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<EditorialErrorBoundary><BrokenRow /></EditorialErrorBoundary>);

    expect(screen.getByRole("alert").textContent).toContain("Your other Aptlyra pages are still available");
    expect(screen.getByRole("button", { name: "Retry section" }).textContent).toBe("Retry section");
    error.mockRestore();
  });
});
