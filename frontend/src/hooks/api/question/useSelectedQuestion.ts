import { useSearch, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useSelectedQuestion = () => {
  const { question, request, comment,history } = useSearch({ from: "/home/" });
  const navigate = useNavigate({ from: "/home" });

  const setSelectedQuestionId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          question: id ?? undefined,
          // Keep request if exists
          request: prev.request,
          comment: prev.comment,
          history:prev.history
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
          comment: prev.comment,
          history:prev.history
        }),
        replace: true,
      });
    },
    [navigate]
  );

  const setSelectedCommentId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          comment: id ?? undefined,
          // Keep other params if they exist
          question: prev.question,
          request: prev.request,
          history:prev.history
        }),
        replace: true,
      });
    },
    [navigate]
  );
  const setSelectedHistoryId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          history: id ?? undefined,
          // Keep request if exists
          request: prev.request,
          comment: prev.comment,
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
    selectedCommentId: comment ?? null,
    selectedHistoryId:history??null,
    setSelectedQuestionId,
    setSelectedRequestId,
    setSelectedCommentId,
    setSelectedHistoryId
  };
};
