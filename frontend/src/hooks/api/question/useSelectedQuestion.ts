import { useSearch, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useSelectedQuestion = () => {
  const { question, request, comment,history,expertId,questionType, view } = useSearch({ strict: false });
  const navigate = useNavigate({ from: "/home" });

  const setSelectedQuestionId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev: any) => ({
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
  const setSelectedQuestionType = useCallback(
    (questionType: string | null) => {
      navigate({
        search: (prev: any) => ({
          ...prev,
          questionType: questionType ?? undefined,
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
        search: (prev: any) => ({
          ...prev,
          request: id ?? undefined,
          // Keep question if exists
          question: prev.question,
          comment: prev.comment,
          history:prev.history,
          expertId:prev.expertId
        }),
        replace: true,
      });
    },
    [navigate]
  );

  const setSelectedCommentId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev: any) => ({
          ...prev,
          comment: id ?? undefined,
          // Keep other params if they exist
          question: prev.question,
          request: prev.request,
          history:prev.history,
          expertId:prev.expertId
        }),
        replace: true,
      });
    },
    [navigate]
  );
  const setSelectedHistoryId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev: any) => ({
          ...prev,
          history: id ?? undefined,
          // Keep request if exists
          request: prev.request,
          comment: prev.comment,
          question: prev.question,
          expertId:prev.expertId

        }),
        replace: true,
      });
    },
    [navigate]
  );
 /* const setSelectedExpertId = useCallback(
    (id: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          expertId: id ?? undefined,
          // Keep request if exists
          request: prev.request,
          comment: prev.comment,
          question: prev.question,
          history:prev.history,

        }),
        replace: true,
      });
    },
    [navigate]
  );*/

  const setView = useCallback(
    (view: string | undefined) => {
      navigate({
        search: (prev: any) => ({
          ...prev,
          view,
        }),
        replace: true,
      });
    },
    [navigate],
  );
  return {
    selectedQuestionId: question ?? null,
    selectedRequestId: request ?? null,
    selectedCommentId: comment ?? null,
    selectedHistoryId:history??null,
    setSelectedQuestionId,
    setSelectedRequestId,
    setSelectedCommentId,
    setSelectedHistoryId,
    selectedQuestionType:questionType??null,
    setSelectedQuestionType,
    view,
    setView,
   // selectedExpertId:expertId??null,
   // setSelectedExpertId
  };
};
