import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BulkOperationsPanel } from "@/features/chatbotDashboard/components/BulkOperationsPanel";

describe("BulkOperationsPanel", () => {
  it("renders without crashing", () => {
    render(<BulkOperationsPanel />);
    expect(screen.getByText("Bulk Assign")).toBeTruthy();
  });

  it("displays all 4 operation type selectors", () => {
    render(<BulkOperationsPanel />);
    expect(screen.getByText("Bulk Assign")).toBeTruthy();
    expect(screen.getByText("Bulk Re-route")).toBeTruthy();
    expect(screen.getByText("Status Change")).toBeTruthy();
    expect(screen.getByText("CSV Upload")).toBeTruthy();
  });

  it("shows the default assign form title", () => {
    render(<BulkOperationsPanel />);
    expect(screen.getByText("Bulk Assign Questions")).toBeTruthy();
  });

  it("shows operation history section", () => {
    render(<BulkOperationsPanel />);
    expect(screen.getByText("Recent Operations")).toBeTruthy();
  });

  it("shows operation history entries", () => {
    render(<BulkOperationsPanel />);
    expect(screen.getByText(/Assigned 45 questions to Dr. Patel/)).toBeTruthy();
    expect(screen.getByText(/Re-routed 120 questions/)).toBeTruthy();
  });

  it("shows operation icons", () => {
    const { container } = render(<BulkOperationsPanel />);
    const icons = container.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(0);
  });

  it("shows processed items count", () => {
    render(<BulkOperationsPanel />);
    expect(screen.getByText(/45\/45 items/)).toBeTruthy();
  });
});
