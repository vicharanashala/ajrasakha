type UnknownRecord = Record<string, unknown>;

const GDB_TOOL_NAME = "gdb";

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);

// Normalises a tool output (JSON string, MCP text-item array or object) into a plain object.
const parseToolOutput = (output: unknown): UnknownRecord | null => {
    if (isRecord(output)) return output;

    if (typeof output === "string") {
        try {
            const parsed: unknown = JSON.parse(output);
            return isRecord(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    if (Array.isArray(output)) {
        for (const item of output) {
            if (isRecord(item) && item.type === "text") {
                const parsed = parseToolOutput(item.text);
                if (parsed) return parsed;
            }
        }
    }

    return null;
};

// Returns the answer of the entry marked chosen_for_answer, preferring the one matching chosen_question_id.
export const getChosenAnswerFromGdbOutput = (output: unknown): string | null => {
    const data = parseToolOutput(output);
    if (!data) return null;

    const chosenQuestionId =
        typeof data.chosen_question_id === "string" ? data.chosen_question_id : null;

    const candidates = Object.values(data).filter(
        (value): value is UnknownRecord =>
            isRecord(value) &&
            value.chosen_for_answer === true &&
            typeof value.answer === "string" &&
            value.answer.trim() !== ""
    );

    const chosen =
        candidates.find((entry) => chosenQuestionId && entry.question_id === chosenQuestionId) ??
        candidates[0];

    return chosen ? (chosen.answer as string).trim() : null;
};

// Finds the latest gdb tool call in the chat content (new and old formats) and returns its chosen answer.
export const extractGdbChosenAnswer = (content: unknown): string | null => {
    if (!Array.isArray(content)) return null;

    for (let i = content.length - 1; i >= 0; i--) {
        const item = content[i];
        if (!isRecord(item)) continue;

        let output: unknown;
        if (item.type === "tool" && item.toolName === GDB_TOOL_NAME) {
            output = item.toolResponse;
        } else if (
            item.type === "tool_call" &&
            isRecord(item.tool_call) &&
            item.tool_call.name === GDB_TOOL_NAME
        ) {
            output = item.tool_call.output;
        } else {
            continue;
        }

        const answer = getChosenAnswerFromGdbOutput(output);
        if (answer) return answer;
    }

    return null;
};
