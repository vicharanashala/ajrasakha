import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PolishDraftPanel } from "./PolishDraftPanel";
import type { PolishDraftResponse } from "@/hooks/services/answerService";

// Acceptance tests for the "Polish draft" panel - mirrors the Writing
// Assistant Build Plan's behavioral examples at the UI layer. The draft
// textarea itself lives in QA-interface.tsx; this component never touches
// it directly - onAccept is the only callback that could, and it's always
// an explicit click, never automatic.

function baseResult(
  overrides: Partial<PolishDraftResponse> = {},
): PolishDraftResponse {
  return {
    requestId: "r1",
    languagePolishing: {
      status: "unavailable",
      suggestedText: null,
      reason: null,
      guardrail: null,
    },
    structuralValidation: {
      status: "reference_data_unavailable",
      matchedReference: null,
      steps: null,
      clarificationReason: null,
    },
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("PolishDraftPanel", () => {
  it("disables the button when there is nothing to polish yet", () => {
    render(
      <PolishDraftPanel
        polishResult={null}
        isPolishing={false}
        canPolish={false}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Polish draft").closest("button")).toBeDisabled();
  });

  it("calls onPolish when clicked with a non-empty draft", () => {
    const onPolish = vi.fn();
    render(
      <PolishDraftPanel
        polishResult={null}
        isPolishing={false}
        canPolish={true}
        onPolish={onPolish}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Polish draft"));
    expect(onPolish).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state while checking, without rendering any result panel", () => {
    render(
      <PolishDraftPanel
        polishResult={null}
        isPolishing={true}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Checking…")).toBeDefined();
  });

  // Example A-shaped case: a clean suggestion is offered, and accepting it
  // is the ONLY way the draft would ever change.
  it("shows the suggested wording and calls onAccept only on explicit click", () => {
    const onAccept = vi.fn();
    const result = baseResult({
      languagePolishing: {
        status: "suggested",
        suggestedText: "The treatment is effective when farmers apply it correctly.",
        reason: null,
        guardrail: {
          status: "passed",
          checkedTokens: {
            numbersAndUnits: "n/a",
            chemicalNames: "n/a",
            certaintyLanguage: "unchanged",
            negation: "n/a",
            cropNames: "n/a",
            treatmentIdentity: "n/a",
            timing: "n/a",
            conditions: "n/a",
            sentenceAlignment: "unchanged",
          },
          details: [],
          disclaimer: "These checks reduce risk; they do not prove complete semantic equivalence.",
        },
      },
    });

    render(
      <PolishDraftPanel
        polishResult={result}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={onAccept}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText("The treatment is effective when farmers apply it correctly."),
    ).toBeDefined();
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Use this wording"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("shows the rejection reason and offers no suggestion to accept", () => {
    const result = baseResult({
      languagePolishing: {
        status: "rejected",
        suggestedText: null,
        reason: "The rewrite changes the dosage from 2 ml to 5 ml per litre.",
        guardrail: null,
      },
    });

    render(
      <PolishDraftPanel
        polishResult={result}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText("The rewrite changes the dosage from 2 ml to 5 ml per litre."),
    ).toBeDefined();
    expect(screen.queryByText("Use this wording")).toBeNull();
  });

  it("reports complete structural coverage", () => {
    const result = baseResult({
      structuralValidation: {
        status: "complete",
        matchedReference: {
          sourceType: "domain",
          domain: "Soil Health and Nutrient Management",
          code: "SHNM",
          questionType: "Broad",
          crop: null,
        },
        steps: null,
        clarificationReason: null,
      },
    });

    render(
      <PolishDraftPanel
        polishResult={result}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText("All expected steps for this type of question are covered."),
    ).toBeDefined();
  });

  // Example D-shaped case: missing steps are reported with their reference
  // example text, never invented content.
  it("lists missing/partial steps using the reference's own example text", () => {
    const result = baseResult({
      structuralValidation: {
        status: "incomplete",
        matchedReference: {
          sourceType: "domain",
          domain: "Disease Management",
          code: "PDM",
          questionType: "Broad",
          crop: null,
        },
        steps: [
          { slNo: 1, step: "Introduction", coverage: "covered", example: "...", suggestion1: null, suggestion2: null },
          { slNo: 2, step: "Biological control", coverage: "missing", example: "Use Trichoderma viride.", suggestion1: null, suggestion2: null },
        ],
        clarificationReason: null,
      },
    });

    render(
      <PolishDraftPanel
        polishResult={result}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Biological control")).toBeDefined();
    expect(screen.getByText("Use Trichoderma viride.")).toBeDefined();
  });

  it("shows the clarification reason when the reference match is ambiguous", () => {
    const result = baseResult({
      structuralValidation: {
        status: "needs_clarification",
        matchedReference: null,
        steps: null,
        clarificationReason: "Multiple specific reference topics could apply and conflict.",
      },
    });

    render(
      <PolishDraftPanel
        polishResult={result}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Multiple specific reference topics could apply and conflict."),
    ).toBeDefined();
  });

  // Example E - reference data unavailable must never read as "complete".
  it("never reports unavailable reference data as a passed structural check", () => {
    const result = baseResult(); // default structuralValidation.status is reference_data_unavailable

    render(
      <PolishDraftPanel
        polishResult={result}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Structure check is unavailable right now.")).toBeDefined();
    expect(
      screen.queryByText("All expected steps for this type of question are covered."),
    ).toBeNull();
  });

  it("calls onDismiss from the Dismiss link once a result is shown", () => {
    const onDismiss = vi.fn();
    render(
      <PolishDraftPanel
        polishResult={baseResult()}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders no result panel at all when there is no result yet", () => {
    render(
      <PolishDraftPanel
        polishResult={null}
        isPolishing={false}
        canPolish={true}
        onPolish={vi.fn()}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByText("Dismiss")).toBeNull();
  });
});
