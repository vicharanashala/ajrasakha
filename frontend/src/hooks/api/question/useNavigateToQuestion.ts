import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export const useNavigateToQuestion = () => {
  const navigate = useNavigate();

  const goToQuestion = useCallback(
    (questionId: string,questiontype:string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, question: questionId,questionType:questiontype }),
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

export const useNavigateToComment = () => {
  const navigate = useNavigate();

  const goToComment = useCallback(
    (questionId: string) => {
      navigate({
        to: "/home",
        search: (prev) => ({
          ...prev,
          comment: questionId,
        }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToComment };
};

export const useNavigateToHistory = () => {
  const navigate = useNavigate();

  const goToHistory = useCallback(
    (questionId: string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, history: questionId }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToHistory };
};
export const useNavigateToExpertDashboard = () => {
  const navigate = useNavigate();

  const goToExpertDashboard = useCallback(
    (expertUserId: string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, expertId: expertUserId }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToExpertDashboard };
};
