import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export const useRestartOnView = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 1 });
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (isInView) setKey((prev) => prev + 1);
  }, [isInView]);

  return { ref, key };
};
