import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useNavigateToQuestion = () => {
  const navigate = useNavigate();

  const goToQuestion = useCallback(
    (questionId: string) => {
      navigate({
        to: "/home",
        search: { question: questionId },
        replace: true,
      });
    },
    [navigate]
  );

  return { goToQuestion };
};