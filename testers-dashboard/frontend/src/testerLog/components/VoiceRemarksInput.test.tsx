// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VoiceRemarksInput } from "./VoiceRemarksInput";
import { TesterLogService } from "../services/testerLogService";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe("VoiceRemarksInput", () => {
    let mockValidateGrammar: any;

    beforeEach(() => {
        mockValidateGrammar = vi.spyOn(TesterLogService.prototype, "validateGrammar").mockResolvedValue({
            isValid: true,
            originalText: "The application is working correctly.",
            suggestions: [],
            validationErrors: [],
        });

        // Mock Web Speech API
        (window as any).SpeechRecognition = class MockSpeechRecognition {
            continuous = false;
            interimResults = false;
            lang = "";
            onstart: any = null;
            onresult: any = null;
            onerror: any = null;
            onend: any = null;

            start() {
                if (this.onstart) this.onstart();
            }
            stop() {
                if (this.onend) this.onend();
            }
            abort() {
                if (this.onend) this.onend();
            }
        };
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;
    });

    it("renders label, placeholder, and character count", () => {
        const onChange = vi.fn();
        render(
            <VoiceRemarksInput
                label="Remarks Details"
                value="Initial note"
                maxLength={2000}
                required
                onChange={onChange}
            />
        );

        expect(screen.getByText("Remarks Details")).toBeTruthy();
        expect(screen.getByText("*")).toBeTruthy();
        expect(screen.getByText("12 / 2000")).toBeTruthy();
        const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
        expect(textarea.value).toBe("Initial note");
    });

    it("invokes onChange when user types manually", () => {
        const onChange = vi.fn();
        render(
            <VoiceRemarksInput
                value=""
                onChange={onChange}
            />
        );

        const textarea = screen.getByRole("textbox");
        fireEvent.change(textarea, { target: { value: "Manually typed text" } });
        expect(onChange).toHaveBeenCalledWith("Manually typed text");
    });

    it("displays error message when provided", () => {
        render(
            <VoiceRemarksInput
                value=""
                error="Remarks must be at least 3 characters"
                onChange={vi.fn()}
            />
        );

        expect(screen.getByText("Remarks must be at least 3 characters")).toBeTruthy();
    });

    it("toggles microphone on/off when clicking Speak Note", async () => {
        const onChange = vi.fn();
        render(
            <VoiceRemarksInput
                value=""
                onChange={onChange}
            />
        );

        const micBtn = screen.getByRole("button", { name: /Speak Note/i });
        fireEvent.click(micBtn);

        // Should change to Stop Recording state
        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Stop Recording/i })).toBeTruthy();
        });

        // Click again to stop
        const stopBtn = screen.getByRole("button", { name: /Stop Recording/i });
        fireEvent.click(stopBtn);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /Speak Note/i })).toBeTruthy();
        });
    });

    it("renders fallback notification when speech recognition is unavailable", () => {
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;

        render(
            <VoiceRemarksInput
                value=""
                onChange={vi.fn()}
            />
        );

        expect(screen.getByText(/Native speech recognition is not available/i)).toBeTruthy();
    });

    it("appends dictated speech to existing remarks without duplication", () => {
        let recognitionInstance: any;
        (window as any).SpeechRecognition = class MockSpeechRecognition {
            continuous = true;
            interimResults = true;
            lang = "";
            onstart: any = null;
            onresult: any = null;
            onerror: any = null;
            onend: any = null;

            constructor() {
                recognitionInstance = this;
            }

            start() {
                if (this.onstart) this.onstart();
            }
            stop() {
                if (this.onend) this.onend();
            }
            abort() {
                if (this.onend) this.onend();
            }
        };

        const onChange = vi.fn();
        render(
            <VoiceRemarksInput
                value="Initial typed defect."
                onChange={onChange}
            />
        );

        const micBtn = screen.getByRole("button", { name: /Speak Note/i });
        fireEvent.click(micBtn);

        // Simulate incoming final speech result
        const mockResultEvent = {
            resultIndex: 0,
            results: [
                Object.assign([{ transcript: "Server returned 500 error." }], { isFinal: true }),
            ],
        };

        act(() => {
            recognitionInstance.onresult(mockResultEvent);
        });
        expect(onChange).toHaveBeenCalledWith("Initial typed defect. Server returned 500 error.");

        // Simulate onend
        act(() => {
            recognitionInstance.onend();
        });
        expect(onChange).toHaveBeenLastCalledWith("Initial typed defect. Server returned 500 error.");
    });

    it("validates grammar using in-house AI model when clicking 'Check Grammar'", async () => {
        mockValidateGrammar.mockResolvedValueOnce({
            isValid: false,
            originalText: "She go to school yesterday.",
            suggestions: [
                {
                    original: "She go to school yesterday.",
                    corrected: "She went to school yesterday.",
                    explanation: "Use past tense 'went' instead of 'go'.",
                },
            ],
            validationErrors: [],
        });

        const onChange = vi.fn();
        render(
            <VoiceRemarksInput
                value="She go to school yesterday."
                onChange={onChange}
            />
        );

        const checkBtn = screen.getByRole("button", { name: /Check Grammar/i });
        fireEvent.click(checkBtn);

        await waitFor(() => {
            expect(mockValidateGrammar).toHaveBeenCalledWith("She go to school yesterday.");
            expect(screen.getByText(/Grammar Suggestions \(1\)/i)).toBeTruthy();
            expect(screen.getByText("Use past tense 'went' instead of 'go'.")).toBeTruthy();
            expect(screen.getByText("She went to school yesterday.")).toBeTruthy();
        });

        // Click Apply
        const applyBtn = screen.getByRole("button", { name: /Apply/i });
        fireEvent.click(applyBtn);

        expect(onChange).toHaveBeenCalledWith("She went to school yesterday.");

        // Undo Fix should now be available
        const undoBtn = screen.getByRole("button", { name: /Undo Fix/i });
        expect(undoBtn).toBeTruthy();

        // Click Undo Fix
        fireEvent.click(undoBtn);
        expect(onChange).toHaveBeenCalledWith("She go to school yesterday.");
    });

    it("displays valid grammar confirmation when text is grammatically correct", async () => {
        mockValidateGrammar.mockResolvedValueOnce({
            isValid: true,
            originalText: "The application is working correctly.",
            suggestions: [],
            validationErrors: [],
        });

        render(
            <VoiceRemarksInput
                value="The application is working correctly."
                onChange={vi.fn()}
            />
        );

        const checkBtn = screen.getByRole("button", { name: /Check Grammar/i });
        fireEvent.click(checkBtn);

        await waitFor(() => {
            expect(screen.getByText(/Grammar validated\./i)).toBeTruthy();
        });
    });
});
