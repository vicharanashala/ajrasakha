// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    let mockFormatRemarks: any;

    beforeEach(() => {
        mockFormatRemarks = vi.spyOn(TesterLogService.prototype, "formatRemarks").mockResolvedValue({
            originalText: "button not working",
            formattedText: "Issue: Submit button is unresponsive.",
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

    it("triggers AI formatting when clicking 'Organize with AI'", async () => {
        const onChange = vi.fn();
        render(
            <VoiceRemarksInput
                value="button not working"
                category="Bug"
                onChange={onChange}
            />
        );

        const organizeBtn = screen.getByRole("button", { name: /Organize with AI/i });
        fireEvent.click(organizeBtn);

        await waitFor(() => {
            expect(mockFormatRemarks).toHaveBeenCalledWith("button not working", "Bug", "en-IN");
            expect(onChange).toHaveBeenCalledWith("Issue: Submit button is unresponsive.");
        });

        // Undo button should now be visible
        const undoBtn = screen.getByRole("button", { name: /Undo AI/i });
        expect(undoBtn).toBeTruthy();

        // Clicking undo should revert to original
        fireEvent.click(undoBtn);
        expect(onChange).toHaveBeenCalledWith("button not working");
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
});
