import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useNavigateToQuestion = () => {
  const navigate = useNavigate();

  const goToQuestion = useCallback(
    (questionId: string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, question: questionId }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToQuestion };
};

export const useNavigateToRequest = () => {
  const navigate = useNavigate();

  const goToRequest = useCallback(
    (requestId: string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, request: requestId }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToRequest };
};