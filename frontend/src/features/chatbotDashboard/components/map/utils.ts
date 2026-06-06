import { useState, useEffect } from "react";

export function useIsDark() {
  const [dark, setDark] = useState(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function colorFor(value: number, min: number, max: number, dark: boolean) {
  if (max === min) return dark ? "#3b82f6" : "#60a5fa";
  const t = (value - min) / (max - min);
  // Blue → cyan → green ramp; tune lightness per theme
  const ramp = dark
    ? ["#1e3a8a", "#1d4ed8", "#0ea5e9", "#06b6d4", "#10b981"]
    : ["#dbeafe", "#93c5fd", "#3b82f6", "#0ea5e9", "#0891b2"];
  if (t < 0.2) return ramp[0];
  if (t < 0.4) return ramp[1];
  if (t < 0.65) return ramp[2];
  if (t < 0.85) return ramp[3];
  return ramp[4];
}

export const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toString();
