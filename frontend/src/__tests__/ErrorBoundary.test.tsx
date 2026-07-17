import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "@/components/atoms/ErrorBoundary";

function ThrowingComponent({
  shouldThrow = true,
  message = "Test error",
}: {
  shouldThrow?: boolean;
  message?: string;
}) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="child-content">Child rendered</div>;
}

function BrokenChild() {
  throw new Error("Network request failed");
}

describe("ErrorBoundary", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    consoleSpy.mockClear();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div data-testid="safe-child">Safe content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("safe-child")).toBeTruthy();
  });

  it("catches errors and renders fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} message="Component crashed" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("This section failed to load.")).toBeTruthy();
  });

  it("does not render children after error", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId("child-content")).toBeNull();
  });

  it("renders root-level fallback with full UI", () => {
    render(
      <ErrorBoundary level="root" showDetails>
        <ThrowingComponent shouldThrow={true} message="App crashed" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.getByText("Go to Dashboard")).toBeTruthy();
  });

  it("renders page-level fallback", () => {
    render(
      <ErrorBoundary level="page">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Page Error")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("resets error state when Try Again is clicked", () => {
    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error("Conditional error");
      }
      return <div data-testid="recovered">Recovered!</div>;
    }

    const { rerender } = render(
      <ErrorBoundary level="section">
        <ConditionalThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("This section failed to load.")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try Again"));

    rerender(
      <ErrorBoundary level="section">
        <ConditionalThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("recovered")).toBeTruthy();
  });

  it("shows error details when showDetails is true and Show details is clicked", () => {
    render(
      <ErrorBoundary level="root" showDetails>
        <ThrowingComponent shouldThrow={true} message="Detailed error message" />
      </ErrorBoundary>,
    );

    const showDetailsBtn = screen.getByText("Show details");
    fireEvent.click(showDetailsBtn);

    expect(screen.getByText("Hide details")).toBeTruthy();
  });

  it("logs error to console", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(consoleSpy).toHaveBeenCalled();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error UI</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("custom-fallback")).toBeTruthy();
    expect(screen.getByText("Custom error UI")).toBeTruthy();
  });

  it("does not catch errors from non-child components", () => {
    render(
      <ErrorBoundary>
        <div data-testid="sibling">Sibling content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("sibling")).toBeTruthy();
  });
});
