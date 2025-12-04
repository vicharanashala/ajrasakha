export const calculateHoursSince = (date: Date) => {
  const createdAt = new Date(date);
  const now = new Date();

  const diffMs = now.getTime() - createdAt.getTime();

  // SLA = 4 hours
  const totalAllowedMs = 4 * 60 * 60 * 1000;
  const remainingMs = totalAllowedMs - diffMs;

  const hrs = Math.floor(remainingMs / (1000 * 60 * 60));
  const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  let remaining = null;

  if (remainingMs > 0) {
    remaining = { hrs, mins };   
  }

  return { remaining, remainingMs };
};
