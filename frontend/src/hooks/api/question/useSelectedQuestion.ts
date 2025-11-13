import { useSearch, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useSelectedQuestion = () => {
  const { question } = useSearch({ from: "/home/" });

  const navigate = useNavigate({ from: "/home" });

  const setSelectedQuestionId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({ ...prev, question: id ?? undefined }),
        replace: true,
      });
    },
    [navigate]
  );

  return {
    selectedQuestionId: question ?? null,
    setSelectedQuestionId,
  };
};