import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch } from '../index';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
}

interface ToastState {
  toasts: ToastMessage[];
}

const initialState: ToastState = {
  toasts: [],
};

export const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: (
      state,
      action: PayloadAction<{ id?: string; type: 'success' | 'error'; message: string }>
    ) => {
      const id = action.payload.id || String(Date.now() + Math.random());
      state.toasts.push({
        id,
        type: action.payload.type,
        message: action.payload.message,
      });
    },
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    clearToasts: (state) => {
      state.toasts = [];
    },
  },
});

export const { addToast, removeToast, clearToasts } = toastSlice.actions;

export const showToastWithTimeout =
  (type: 'success' | 'error', message: string, durationMs = 4000) =>
  (dispatch: AppDispatch) => {
    const id = String(Date.now() + Math.random());
    dispatch(addToast({ id, type, message }));
    setTimeout(() => {
      dispatch(removeToast(id));
    }, durationMs);
  };

export default toastSlice.reducer;
