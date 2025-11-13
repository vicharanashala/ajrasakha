import { useSearch, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useSelectedQuestion = () => {
  const { question, request } = useSearch({ from: "/home/" });
  const navigate = useNavigate({ from: "/home" });

  const setSelectedQuestionId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          question: id ?? undefined,
          // Keep request if exists
          request: prev.request,
        }),
        replace: true,
      });
    },
    [navigate]
  );

  const setSelectedRequestId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          request: id ?? undefined,
          // Keep question if exists
          question: prev.question,
        }),
        replace: true,
      });
    },
    [navigate]
  );

  return {
    selectedQuestionId: question ?? null,
    selectedRequestId: request ?? null,
    setSelectedQuestionId,
    setSelectedRequestId,
  };
};