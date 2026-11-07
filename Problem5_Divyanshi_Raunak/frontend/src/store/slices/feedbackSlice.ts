import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type {
  AnalyticsOverview,
  DomainAnalyticsItem,
  StateAnalyticsItem,
  RootCauseItem,
  FlaggedEntry,
  FlaggedConfig,
} from '../../types';
import { addToast, removeToast } from './toastSlice';
import type { AppDispatch } from '../index';

export interface FeedbackState {
  isOnline: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  overview: AnalyticsOverview | null;
  domains: DomainAnalyticsItem[];
  states: StateAnalyticsItem[];
  rootCauses: RootCauseItem[];
  flaggedQueue: FlaggedEntry[];
  flaggedTotal: number;
  unresolvedFlaggedCount: number;
  resolvedFlaggedCount: number;
  flaggedConfig: FlaggedConfig | null;
  lastUpdated: string | null;
}

const initialState: FeedbackState = {
  isOnline: true,
  isRefreshing: false,
  isLoading: true,
  overview: null,
  domains: [],
  states: [],
  rootCauses: [],
  flaggedQueue: [],
  flaggedTotal: 0,
  unresolvedFlaggedCount: 0,
  resolvedFlaggedCount: 0,
  flaggedConfig: null,
  lastUpdated: null,
};

export const fetchDashboardData = createAsyncThunk(
  'feedback/fetchDashboardData',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const [
        overviewData,
        domainsData,
        statesData,
        rootCausesData,
        flaggedData,
        configData,
      ] = await Promise.all([
        api.getOverview().catch(() => null),
        api.getDomains().catch(() => []),
        api.getStates().catch(() => []),
        api.getRootCauses().catch(() => []),
        api.getFlaggedQueue().catch(() => ({ total: 0, queue: [] })),
        api.getFlaggedConfig().catch(() => null),
      ]);

      if (!overviewData) {
        return rejectWithValue('Backend service unreachable or offline');
      }

      const queue: FlaggedEntry[] = flaggedData?.queue || [];
      const isItemResolved = (item: FlaggedEntry) =>
        item.is_resolved === true ||
        item.flag_info?.is_resolved === true ||
        item.flag_info?.resolved === true ||
        item.status === 'RE_VALIDATED' ||
        item.status === 'RESOLVED' ||
        item.flag_info?.review_status === 'RESOLVED' ||
        item.flag_info?.review_status === 'RE_VALIDATED';

      const resolvedCount = queue.filter(isItemResolved).length;
      const unresolvedCount = queue.filter((item) => !isItemResolved(item)).length;

      return {
        overview: overviewData,
        domains: domainsData || [],
        states: statesData || [],
        rootCauses: rootCausesData || [],
        flaggedQueue: queue,
        flaggedTotal: flaggedData?.total || 0,
        unresolvedFlaggedCount: unresolvedCount,
        resolvedFlaggedCount: resolvedCount,
        flaggedConfig: configData,
      };
    } catch (err: any) {
      const id = String(Date.now() + Math.random());
      dispatch(addToast({ id, type: 'error', message: `Failed to connect to backend: ${err.message}` }));
      setTimeout(() => {
        dispatch(removeToast(id));
      }, 4000);
      return rejectWithValue(err.message);
    }
  }
);

export const checkBackendHealth = createAsyncThunk<boolean>(
  'feedback/checkBackendHealth',
  async () => {
    try {
      const res = await api.checkHealth();
      const st = (res?.status || '').toLowerCase();
      return st === 'online' || st === 'ok' || Boolean(res?.project);
    } catch {
      return false;
    }
  }
);

export const resolveFlaggedEntryThunk =
  (
    gdbId: string,
    payload: {
      revised_answer_hi: string;
      revised_answer_en: string;
      reviewer_note: string;
      action?: string;
    }
  ) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      await api.resolveFlaggedEntry(gdbId, payload);
      dispatch(markEntryResolved({ gdbId }));
      const id = String(Date.now() + Math.random());
      dispatch(
        addToast({
          id,
          type: 'success',
          message: `GDB entry ${gdbId} resolved & updated in Knowledge Base!`,
        })
      );
      setTimeout(() => {
        dispatch(removeToast(id));
      }, 4000);
      await dispatch(fetchDashboardData());
      return true;
    } catch (err: any) {
      const id = String(Date.now() + Math.random());
      dispatch(addToast({ id, type: 'error', message: `Resolution failed: ${err.message}` }));
      setTimeout(() => {
        dispatch(removeToast(id));
      }, 4000);
      return false;
    }
  };

export const updateFlaggedConfigThunk =
  (config: FlaggedConfig) =>
  async (dispatch: AppDispatch): Promise<boolean> => {
    try {
      await api.updateFlaggedConfig(config);
      const id = String(Date.now() + Math.random());
      dispatch(
        addToast({
          id,
          type: 'success',
          message: `Flagging thresholds updated to ${(config.helpful_threshold * 100).toFixed(0)}% (N >= ${config.min_responses})`,
        })
      );
      setTimeout(() => {
        dispatch(removeToast(id));
      }, 4000);
      await dispatch(fetchDashboardData());
      return true;
    } catch (err: any) {
      const id = String(Date.now() + Math.random());
      dispatch(addToast({ id, type: 'error', message: `Config update failed: ${err.message}` }));
      setTimeout(() => {
        dispatch(removeToast(id));
      }, 4000);
      return false;
    }
  };

export const feedbackSlice = createSlice({
  name: 'feedback',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setRefreshing: (state, action: PayloadAction<boolean>) => {
      state.isRefreshing = action.payload;
    },
    markEntryResolved: (state, action: PayloadAction<{ gdbId: string }>) => {
      const idx = state.flaggedQueue.findIndex((item) => item.gdb_id === action.payload.gdbId);
      if (idx !== -1) {
        state.flaggedQueue[idx].is_resolved = true;
        state.flaggedQueue[idx].is_flagged = false;
        state.flaggedQueue[idx].status = 'RE_VALIDATED';
        if (state.flaggedQueue[idx].flag_info) {
          state.flaggedQueue[idx].flag_info!.is_resolved = true;
          state.flaggedQueue[idx].flag_info!.review_status = 'RESOLVED';
          state.flaggedQueue[idx].flag_info!.flag_reason = null;
        }
      }
      const isResolved = (item: FlaggedEntry) =>
        item.is_resolved === true ||
        item.flag_info?.is_resolved === true ||
        item.flag_info?.resolved === true ||
        item.status === 'RE_VALIDATED' ||
        item.status === 'RESOLVED' ||
        item.flag_info?.review_status === 'RESOLVED' ||
        item.flag_info?.review_status === 'RE_VALIDATED';

      state.resolvedFlaggedCount = state.flaggedQueue.filter(isResolved).length;
      state.unresolvedFlaggedCount = state.flaggedQueue.filter((item) => !isResolved(item)).length;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchDashboardData
      .addCase(fetchDashboardData.pending, (state) => {
        state.isRefreshing = true;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.isRefreshing = false;
        state.isLoading = false;
        state.isOnline = true;
        state.overview = action.payload.overview;
        state.domains = action.payload.domains;
        state.states = action.payload.states;
        state.rootCauses = action.payload.rootCauses;
        state.flaggedQueue = action.payload.flaggedQueue;
        state.flaggedTotal = action.payload.flaggedTotal;
        state.unresolvedFlaggedCount = action.payload.unresolvedFlaggedCount;
        state.resolvedFlaggedCount = action.payload.resolvedFlaggedCount;
        state.flaggedConfig = action.payload.flaggedConfig;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchDashboardData.rejected, (state) => {
        state.isRefreshing = false;
        state.isLoading = false;
        state.isOnline = false;
      })
      // checkBackendHealth
      .addCase(checkBackendHealth.fulfilled, (state, action: PayloadAction<boolean>) => {
        state.isOnline = action.payload;
      })
      .addCase(checkBackendHealth.rejected, (state) => {
        state.isOnline = false;
      });
  },
});

export const { setOnlineStatus, setLoading, setRefreshing, markEntryResolved } = feedbackSlice.actions;

export default feedbackSlice.reducer;
