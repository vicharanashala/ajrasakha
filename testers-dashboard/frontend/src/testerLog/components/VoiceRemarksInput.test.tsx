// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VoiceRemarksInput } from "./VoiceRemarksInput";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe("VoiceRemarksInput", () => {
    beforeEach(() => {
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
});
