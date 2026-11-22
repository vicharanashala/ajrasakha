import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  fetchDashboardData,
  resolveFlaggedEntryThunk,
  updateFlaggedConfigThunk
} from '../store/slices/feedbackSlice';
import {
  removeToast as removeToastAction,
  showToastWithTimeout
} from '../store/slices/toastSlice';
import type { FlaggedConfig } from '../types';

export type { ToastMessage } from '../store/slices/toastSlice';

/**
 * Redux-backed custom hook providing state and actions.
 * Completely replaces React's createContext with Redux Toolkit and React-Redux.
 */
export function useAppRedux() {
  const dispatch = useAppDispatch();
  const feedback = useAppSelector((state) => state.feedback);
  const toasts = useAppSelector((state) => state.toast.toasts);

  const addToast = useCallback(
    (type: 'success' | 'error', message: string) => {
      dispatch(showToastWithTimeout(type, message));
    },
    [dispatch]
  );

  const removeToast = useCallback(
    (id: string) => {
      dispatch(removeToastAction(id));
    },
    [dispatch]
  );

  const refreshAll = useCallback(async () => {
    await dispatch(fetchDashboardData());
  }, [dispatch]);

  const resolveFlagged = useCallback(
    async (
      gdbId: string,
      payload: {
        revised_answer_hi: string;
        revised_answer_en: string;
        reviewer_note: string;
        action?: string;
      }
    ): Promise<boolean> => {
      return await dispatch(resolveFlaggedEntryThunk(gdbId, payload));
    },
    [dispatch]
  );

  const updateConfig = useCallback(
    async (config: FlaggedConfig): Promise<boolean> => {
      return await dispatch(updateFlaggedConfigThunk(config));
    },
    [dispatch]
  );

  const isItemResolved = (item: any) =>
    item.is_resolved === true ||
    item.flag_info?.is_resolved === true ||
    item.flag_info?.resolved === true ||
    item.status === 'RE_VALIDATED' ||
    item.status === 'RESOLVED' ||
    item.flag_info?.review_status === 'RESOLVED' ||
    item.flag_info?.review_status === 'RE_VALIDATED';

  const unresolvedFlaggedCount = feedback.flaggedQueue.filter((item) => !isItemResolved(item)).length;
  const resolvedFlaggedCount = feedback.flaggedQueue.filter(isItemResolved).length;

  return {
    isOnline: feedback.isOnline,
    isRefreshing: feedback.isRefreshing,
    isLoading: feedback.isLoading,
    overview: feedback.overview,
    domains: feedback.domains,
    states: feedback.states,
    rootCauses: feedback.rootCauses,
    flaggedQueue: feedback.flaggedQueue,
    flaggedTotal: feedback.flaggedTotal,
    unresolvedFlaggedCount,
    resolvedFlaggedCount,
    flaggedConfig: feedback.flaggedConfig,
    toasts,
    addToast,
    removeToast,
    refreshAll,
    resolveFlagged,
    updateConfig,
  };
}

// Seamless alias for backwards compatibility
export const useAppContext = useAppRedux;
