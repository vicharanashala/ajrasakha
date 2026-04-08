import { useCountdown } from "./useCountdown";

export function useQuestionTimer(
  source: string | undefined,
  createdAt: string | undefined | null
) {
  const DURATION_HOURS = source === "AJRASAKHA" ? 2 : 4;
  const timer = useCountdown(createdAt, DURATION_HOURS, () => {});
  return { timer, DURATION_HOURS };
}
