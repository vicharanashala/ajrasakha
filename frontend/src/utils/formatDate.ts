export const formatDate = (date: Date, isTimeNeeded = true): string => {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  if (isTimeNeeded) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return new Date(date).toLocaleString("en-US", options);
};
