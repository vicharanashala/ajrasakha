import { useContext, createContext } from 'react';

export interface ScrollContextValue {
  /** Normalized scroll progress 0–1 across the entire hero pin */
  progress: number;
  /** Current chapter 1–4 */
  chapter: number;
}

export const ScrollProgressContext = createContext<ScrollContextValue>({
  progress: 0,
  chapter: 1,
});

export const useScrollProgress = () => useContext(ScrollProgressContext);
