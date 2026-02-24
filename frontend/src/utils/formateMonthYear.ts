export const formatMonthYear = (date: Date) =>
  date.toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });