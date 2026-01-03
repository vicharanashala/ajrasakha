export const truncate = (s: string, n = 60) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;
