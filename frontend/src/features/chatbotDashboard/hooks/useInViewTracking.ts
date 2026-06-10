import { useRef, useState, useEffect } from "react";

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook for tracking element visibility in viewport
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {}
) {
  const { threshold = 0.1, rootMargin = "0px", triggerOnce = false } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
}

/**
 * Hook for tracking multiple elements' visibility
 */
export function useMultipleInView(
  sectionNames: string[],
  threshold: number = 0.1
) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const observers: Record<string, IntersectionObserver> = {};
    
    sectionNames.forEach((name) => {
      const element = refs.current[name];
      if (!element) return;

      observers[name] = new IntersectionObserver(
        ([entry]) => {
          setVisibility((prev) => ({
            ...prev,
            [name]: entry.isIntersecting,
          }));
        },
        { threshold }
      );

      observers[name].observe(element);
    });

    return () => {
      Object.values(observers).forEach((observer) => observer.disconnect());
    };
  }, [sectionNames.join(","), threshold]);

  const setRef = (name: string) => (el: HTMLDivElement | null) => {
    refs.current[name] = el;
  };

  return {
    refs,
    visibility,
    isVisible: (name: string) => visibility[name] ?? false,
    setRef,
  };
}

/**
 * Check if component should load based on visibility or immediate load flag
 */
export function shouldLoadSection(
  isVisible: boolean,
  loadImmediately: boolean
): boolean {
  return loadImmediately || isVisible;
}