import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DashboardView } from "../DashboardView";

function csvFile(contents: string, name = "evaluation-report.csv") {
  return new File([contents], name, { type: "text/csv" });
}

function uploadCsv(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>(
    'input[type="file"]',
  );
  if (!input) throw new Error("Upload input not found.");
  fireEvent.change(input, { target: { files: [file] } });
}

const VALID_REPORT = [
  "record_type,run_id,run_started_at,selected_case_count,query,observed_domain,technical_pass,final_answer,answerrelevancymetric_score,answerrelevancymetric_status",
  "run_metadata,run-ui,2026-01-01T00:00:00Z,2,,,,,,",
  "case,run-ui,2026-01-01T00:00:00Z,2,Will it rain tomorrow?,Weather,true,Rain is likely.,0.8,scored",
  "case,run-ui,2026-01-01T00:00:00Z,2,What is the market price?,Market,false,Check the bulletin.,0.6,scored",
].join("\n");

afterEach(cleanup);

describe("evaluation dashboard UI", () => {
  it("renders the no-report empty state", () => {
    render(<DashboardView />);

    expect(screen.getByText("No report loaded")).toBeDefined();
    expect(screen.getByText("Choose CSV file")).toBeDefined();
    expect(screen.queryByText("Total Cases")).toBeNull();
  });

  it("renders the mandatory provenance disclaimer", () => {
    render(<DashboardView />);

    expect(
      screen.getByText(
        "Evaluation results depend on the reference data available for this run. Synthetic/manual references should not be interpreted as ACE GDB expert validation.",
      ),
    ).toBeDefined();
  });

  it("shows run information, KPIs, and cases after a valid upload", async () => {
    const { container } = render(<DashboardView />);

    uploadCsv(container, csvFile(VALID_REPORT));

    expect(await screen.findByText("Will it rain tomorrow?")).toBeDefined();
    expect(screen.getByText("Total Cases")).toBeDefined();
    expect(screen.getAllByText("Quality Metrics").length).toBeGreaterThan(0);
    expect(screen.getByText("Run Information")).toBeDefined();
    expect(screen.getAllByText("run-ui").length).toBeGreaterThan(0);
    expect(screen.getByText("50.0%")).toBeDefined();
    expect(screen.getByText("0.70")).toBeDefined();
    expect(screen.queryByText("No report loaded")).toBeNull();
  });

  it("preserves the previous dashboard when an invalid upload is rejected", async () => {
    const { container } = render(<DashboardView />);

    uploadCsv(container, csvFile(VALID_REPORT, "good-report.csv"));
    expect(await screen.findByText("Will it rain tomorrow?")).toBeDefined();

    uploadCsv(
      container,
      csvFile("query,technical_pass\nWill it rain?,true", "bad-report.csv"),
    );

    expect(
      await screen.findByText("Could not load this report"),
    ).toBeDefined();
    expect(screen.queryByText("Total Cases")).toBeDefined();
    expect(screen.getByText("Will it rain tomorrow?")).toBeDefined();
    expect(screen.getByText("good-report.csv")).toBeDefined();
  });

  it("treats a metadata-only report as a valid load", async () => {
    const { container } = render(<DashboardView />);

    uploadCsv(
      container,
      csvFile(
        [
          "record_type,run_id,run_started_at,selected_case_count",
          "run_metadata,run-meta,2026-01-01T00:00:00Z,0",
        ].join("\n"),
      ),
    );

    expect(await screen.findByText("Run Information")).toBeDefined();
    expect(
      screen.getAllByText("Metadata-only report").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("No evaluation cases available."),
    ).toBeDefined();
    expect(screen.queryByText("Could not load this report")).toBeNull();
  });

  it("accepts a case report with no quality scores and shows N/A metrics", async () => {
    const { container } = render(<DashboardView />);

    uploadCsv(
      container,
      csvFile(
        [
          "record_type,query,technical_pass",
          "case,Will it rain?,true",
          "case,Market price?,false",
        ].join("\n"),
      ),
    );

    expect(await screen.findByText("Will it rain?")).toBeDefined();
    expect(
      screen.getByText("No quality scores available"),
    ).toBeDefined();
    expect(screen.queryByText("Could not load this report")).toBeNull();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });
});
