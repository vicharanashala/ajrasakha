import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuestionTrackingPage } from "@/features/chatbotDashboard/components/QuestionTrackingPage";

describe("QuestionTrackingPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders status summary cards", () => {
    render(<QuestionTrackingPage />);
    const submittedBadges = screen.getAllByText("Submitted");
    expect(submittedBadges.length).toBeGreaterThan(0);
  });

  it("shows question texts", () => {
    render(<QuestionTrackingPage />);
    expect(screen.getByText(/What is the best time to sow wheat/)).toBeTruthy();
    expect(screen.getByText(/How to manage waterlogging/)).toBeTruthy();
  });

  it("shows farmer names", () => {
    render(<QuestionTrackingPage />);
    expect(screen.getByText("Ramesh Kumar")).toBeTruthy();
    expect(screen.getByText("Anil Singh")).toBeTruthy();
  });

  it("shows farmer locations", () => {
    render(<QuestionTrackingPage />);
    expect(screen.getByText("Jaipur, Rajasthan")).toBeTruthy();
    expect(screen.getByText("Patna, Bihar")).toBeTruthy();
  });

  it("shows assigned experts", () => {
    render(<QuestionTrackingPage />);
    expect(screen.getByText("Dr. Priya Patel")).toBeTruthy();
    expect(screen.getByText("Prof. Rajesh Sharma")).toBeTruthy();
  });

  it("renders search input", () => {
    render(<QuestionTrackingPage />);
    expect(screen.getByPlaceholderText(/Search by question, farmer name, or ID/)).toBeTruthy();
  });

  it("filters questions by search term", () => {
    render(<QuestionTrackingPage />);
    const input = screen.getByPlaceholderText(/Search by question, farmer name, or ID/);
    fireEvent.change(input, { target: { value: "wheat" } });
    expect(screen.getByText(/What is the best time to sow wheat/)).toBeTruthy();
    expect(screen.queryByText(/How to manage waterlocking/)).toBeNull();
  });

  it("expands question details on click", () => {
    render(<QuestionTrackingPage />);
    const questionCard = screen.getByText(/What is the best time to sow wheat/).closest("div")!;
    fireEvent.click(questionCard);
    expect(screen.getByText("Question ID")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
  });

  it("shows 'No questions match' when filter yields empty", () => {
    render(<QuestionTrackingPage />);
    const input = screen.getByPlaceholderText(/Search by question, farmer name, or ID/);
    fireEvent.change(input, { target: { value: "zzz_nonexistent_zzz" } });
    expect(screen.getByText("No questions match your search")).toBeTruthy();
  });

  it("shows status badges for various statuses", () => {
    render(<QuestionTrackingPage />);
    const badges = screen.getAllByText(/Submitted|Under Review|Answered|Delivered/);
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows language badges", () => {
    render(<QuestionTrackingPage />);
    const hindiBadge = screen.getAllByText("Hindi");
    expect(hindiBadge.length).toBeGreaterThan(0);
  });

  it("shows upvotes", () => {
    const { container } = render(<QuestionTrackingPage />);
    const allText = container.textContent || "";
    expect(allText).toContain("▲");
  });
});
