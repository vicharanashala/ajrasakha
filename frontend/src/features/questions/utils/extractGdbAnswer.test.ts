import { describe, expect, it } from "vitest";
import { extractGdbChosenAnswer, getChosenAnswerFromGdbOutput } from "./extractGdbAnswer";

const gdbOutput = {
    chosen_question_id: "q2",
    exact_match: {},
    classification_audit: {
        evaluations: [{ question_id: "q2", chosen_for_answer: true }],
        chosen_for_answer: true,
    },
    similar_pair1: { question_id: "q1", answer: "Other answer", chosen_for_answer: false },
    similar_pair2: { question_id: "q2", answer: "  Chosen answer  ", chosen_for_answer: true },
    chosen_for_answer: true,
};

describe("getChosenAnswerFromGdbOutput", () => {
    it("returns the answer of the chosen question", () => {
        expect(getChosenAnswerFromGdbOutput(gdbOutput)).toBe("Chosen answer");
    });

    it("parses JSON string and MCP text item outputs", () => {
        const json = JSON.stringify(gdbOutput);
        expect(getChosenAnswerFromGdbOutput(json)).toBe("Chosen answer");
        expect(getChosenAnswerFromGdbOutput([{ type: "text", text: json }])).toBe("Chosen answer");
    });

    it("returns null when nothing is chosen or output is invalid", () => {
        expect(getChosenAnswerFromGdbOutput({ similar_pair1: { answer: "x", chosen_for_answer: false } })).toBeNull();
        expect(getChosenAnswerFromGdbOutput("Calling tool...")).toBeNull();
    });
});

describe("extractGdbChosenAnswer", () => {
    it("reads the gdb tool call in new and old formats", () => {
        expect(extractGdbChosenAnswer([{ type: "tool", toolName: "gdb", toolResponse: JSON.stringify(gdbOutput) }])).toBe("Chosen answer");
        expect(extractGdbChosenAnswer([{ type: "tool_call", tool_call: { name: "gdb", output: gdbOutput } }])).toBe("Chosen answer");
    });

    it("ignores other tools", () => {
        expect(extractGdbChosenAnswer([{ type: "tool", toolName: "other", toolResponse: gdbOutput }])).toBeNull();
    });
});
