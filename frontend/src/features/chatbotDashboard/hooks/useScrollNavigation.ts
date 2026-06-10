import { useRef, useCallback } from "react";
import type { DashboardView } from "../types/index";

/**
 * Hook for managing section refs and scroll navigation
 */
export function useScrollNavigation() {
  const sectionRefs = useRef<Partial<Record<DashboardView, HTMLDivElement | null>>>({});

  const scrollTo = useCallback((view: DashboardView) => {
    setTimeout(
      () =>
        sectionRefs.current[view]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50
    );
  }, []);

  const setSectionRef = useCallback(
    (view: DashboardView) => (el: HTMLDivElement | null) => {
      sectionRefs.current[view] = el;
    },
    []
  );

  return {
    sectionRefs,
    scrollTo,
    setSectionRef,
  };
}

/**
 * Hook for handling view change with scroll
 */
export function useViewChangeWithScroll(
  setActiveView: React.Dispatch<React.SetStateAction<DashboardView>>,
  scrollTo: (view: DashboardView) => void
) {
  const handleViewChange = useCallback(
    (view: DashboardView) => {
      setActiveView(view);
      scrollTo(view);
    },
    [setActiveView, scrollTo]
  );

  return handleViewChange;
}