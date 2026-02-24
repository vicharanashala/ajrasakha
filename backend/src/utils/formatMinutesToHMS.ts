export const formatMinutesToHMS = (minutesValue: number) => {
  const totalSeconds = Math.floor(minutesValue * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours} hr, ${minutes} min, ${seconds} sec`;
};
