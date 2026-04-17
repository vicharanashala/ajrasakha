import { useCountdown, type CountdownHoldOptions } from "./useCountdown";

export function useQuestionTimer(
  source: string | undefined,
  createdAt: string | undefined | null,
  holdOptions?: CountdownHoldOptions
) {
  const DURATION_HOURS = source === "AJRASAKHA" ? 2 : 2;
  const timer = useCountdown(createdAt, DURATION_HOURS, () => {}, holdOptions);
  return { timer, DURATION_HOURS };
}
