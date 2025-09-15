export const getTimeDifference = (
  created?: string,
  updated?: string
): string | undefined => {
  if (!created || !updated) return undefined;

  const createdDate = new Date(created);
  const updatedDate = new Date(updated);

  const diffMs = updatedDate.getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
};
