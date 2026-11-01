import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

// Every "go to X from a notification" destination below is mutually exclusive with the others —
// only one should ever drive the active tab at a time. Previously each hook only added its own
// key and spread the rest of `prev` through unchanged, so a stale key from an earlier navigation
// (e.g. popQueue from a PoP notification) could stick around in the URL and keep outranking
// whatever the user clicked next. Clearing the full set here before setting the new one keeps
// them truly exclusive.
const CLEAR_SELECTION = {
  question: undefined,
  questionType: undefined,
  request: undefined,
  comment: undefined,
  history: undefined,
  expertId: undefined,
  popQueue: undefined,
} as const;

export const useNavigateToQuestion = () => {
  const navigate = useNavigate();

  const goToQuestion = useCallback(
    (questionId: string,questiontype:string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, ...CLEAR_SELECTION, question: questionId,questionType:questiontype }),
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
        search: (prev) => ({ ...prev, ...CLEAR_SELECTION, request: requestId }),
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
          ...CLEAR_SELECTION,
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
        search: (prev) => ({ ...prev, ...CLEAR_SELECTION, history: questionId }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToHistory };
};
export const useNavigateToPopQueue = () => {
  const navigate = useNavigate();

  const goToPopQueue = useCallback(() => {
    navigate({
      to: "/home",
      search: (prev) => ({ ...prev, ...CLEAR_SELECTION, popQueue: "1" }),
      replace: true,
    });
  }, [navigate]);

  return { goToPopQueue };
};

// Same PoP dashboard destination as useNavigateToPopQueue, but opens on the Documents tab's Main
// Table instead of forcing the Add Document upload-queue view — for the "document added" PoP
// notification, whose ANNAM id the user is meant to paste into the Main Table's Document ID
// filter (see NotificationModal.tsx). A distinct popQueue value ("main" vs "1") lets
// play-ground.tsx tell the two apart while still opening the same tab for both.
export const useNavigateToMainTable = () => {
  const navigate = useNavigate();

  const goToMainTable = useCallback(() => {
    navigate({
      to: "/home",
      search: (prev) => ({ ...prev, ...CLEAR_SELECTION, popQueue: "main" }),
      replace: true,
    });
  }, [navigate]);

  return { goToMainTable };
};

export const useNavigateToExpertDashboard = () => {
  const navigate = useNavigate();

  const goToExpertDashboard = useCallback(
    (expertUserId: string) => {
      navigate({
        to: "/home",
        search: (prev) => ({ ...prev, ...CLEAR_SELECTION, expertId: expertUserId }),
        replace: true,
      });
    },
    [navigate]
  );

  return { goToExpertDashboard };
};
