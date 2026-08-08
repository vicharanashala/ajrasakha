import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpertAvailabilityDashboard } from "@/features/chatbotDashboard/components/ExpertAvailabilityDashboard";

describe("ExpertAvailabilityDashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders status overview cards", () => {
    render(<ExpertAvailabilityDashboard />);
    const onlineLabels = screen.getAllByText("Online");
    expect(onlineLabels.length).toBeGreaterThan(0);
  });

  it("shows handled today and avg response cards", () => {
    render(<ExpertAvailabilityDashboard />);
    expect(screen.getByText("Handled Today")).toBeTruthy();
    expect(screen.getByText("Avg Response")).toBeTruthy();
  });

  it("displays shift coverage bar", () => {
    render(<ExpertAvailabilityDashboard />);
    expect(screen.getByText("Shift Coverage — Morning")).toBeTruthy();
  });

  it("shows expert cards with names", () => {
    render(<ExpertAvailabilityDashboard />);
    expect(screen.getByText("Dr. Priya Patel")).toBeTruthy();
    expect(screen.getByText("Prof. Rajesh Sharma")).toBeTruthy();
    expect(screen.getByText("Dr. Anita Kumar")).toBeTruthy();
  });

  it("shows expert roles", () => {
    render(<ExpertAvailabilityDashboard />);
    const roles = screen.getAllByText(/expert|moderator|call agent/i);
    expect(roles.length).toBeGreaterThan(0);
  });

  it("renders search input", () => {
    render(<ExpertAvailabilityDashboard />);
    expect(screen.getByPlaceholderText(/Search by name or email/)).toBeTruthy();
  });

  it("filters experts by search term", () => {
    render(<ExpertAvailabilityDashboard />);
    const input = screen.getByPlaceholderText(/Search by name or email/);
    fireEvent.change(input, { target: { value: "Priya" } });
    expect(screen.getByText("Dr. Priya Patel")).toBeTruthy();
    expect(screen.queryByText("Prof. Rajesh Sharma")).toBeNull();
  });

  it("filters by status button", () => {
    render(<ExpertAvailabilityDashboard />);
    const offlineBtn = screen.getByRole("button", { name: /offline/i });
    fireEvent.click(offlineBtn);
    expect(screen.getByText("Dr. Manoj Desai")).toBeTruthy();
    expect(screen.queryByText("Dr. Priya Patel")).toBeNull();
  });

  it("shows expert stats (handled count, avg time, shift)", () => {
    render(<ExpertAvailabilityDashboard />);
    const handledLabels = screen.getAllByText("Handled");
    expect(handledLabels.length).toBeGreaterThan(0);
  });

  it("shows 'Active now' for online experts", () => {
    render(<ExpertAvailabilityDashboard />);
    const activeNow = screen.getAllByText("Active now");
    expect(activeNow.length).toBeGreaterThan(0);
  });

  it("shows 'No experts match' when filter yields empty", () => {
    render(<ExpertAvailabilityDashboard />);
    const input = screen.getByPlaceholderText(/Search by name or email/);
    fireEvent.change(input, { target: { value: "zzz_nonexistent_zzz" } });
    expect(screen.getByText("No experts match your filter")).toBeTruthy();
  });
});
