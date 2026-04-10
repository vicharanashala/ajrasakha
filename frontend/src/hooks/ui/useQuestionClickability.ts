import type { UserRole } from "@/types";
import { useRef } from "react";
import { useQuestionTimer } from "./useQuestionTimer";

export function useQuestionClickability(
  source: string | undefined,
  createdAt: string | undefined | null,
  uploadedQuestionsCount: number,
  userRole: UserRole,
  isBulkUpload: boolean
) {
  const uploadedCountRef = useRef(uploadedQuestionsCount);
  const { timer, DURATION_HOURS } = useQuestionTimer(source, createdAt);

  const totalSeconds = DURATION_HOURS * 3600;
  const [h, m, s] = timer.split(":").map(Number);
  const remainingSeconds = h * 3600 + m * 60 + s;

  const delayPerQuestion = 180 / 200;
  let delaySeconds = uploadedCountRef.current * delayPerQuestion;
  if (userRole === "expert") delaySeconds = 200;

  const delayMinutes = delaySeconds / 60;
  const isClickable =
    remainingSeconds <= totalSeconds - delaySeconds && !isBulkUpload;

  return { timer, isClickable, delayMinutes };
}
