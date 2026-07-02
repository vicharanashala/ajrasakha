import { useEffect, useMemo, useState } from "react";

export const useInView = () => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useMemo(
    () => ({
      get current() {
        return element;
      },
      set current(node: HTMLDivElement | null) {
        setElement(node);
      },
    }),
    [element],
  );

  useEffect(() => {
    if (!element || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // trigger only once
        }
      },
      { threshold: 0.2 } // trigger when 20% visible
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [element, isVisible]);

  return { ref, isVisible };
};
