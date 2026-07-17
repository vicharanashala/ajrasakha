import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SystemHealthMonitor } from "@/features/chatbotDashboard/components/SystemHealthMonitor";

describe("SystemHealthMonitor", () => {
  it("renders the component container", () => {
    const { container } = render(<SystemHealthMonitor />);
    expect(container.querySelector(".space-y-6")).toBeTruthy();
  });

  it("shows System text in the banner", () => {
    render(<SystemHealthMonitor />);
    const headings = screen.getAllByText(/System/);
    expect(headings.length).toBeGreaterThan(0);
  });

  it("shows refresh and auto-refresh buttons", () => {
    render(<SystemHealthMonitor />);
    expect(screen.getByText("Auto-refresh ON")).toBeTruthy();
    expect(screen.getByText("Refresh")).toBeTruthy();
  });

  it("loads and displays services after async fetch", async () => {
    render(<SystemHealthMonitor />);
    await waitFor(() => {
      expect(screen.getByText("System Information")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("shows Healthy badge and service info after loading", async () => {
    render(<SystemHealthMonitor />);
    await waitFor(() => {
      expect(screen.getByText("Healthy")).toBeTruthy();
    }, { timeout: 10000 });
  });
});
