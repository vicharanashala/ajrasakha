export function getTimerStartTime(
  question: { createdAt?: string },
): string {
  return question.createdAt || "";
}
