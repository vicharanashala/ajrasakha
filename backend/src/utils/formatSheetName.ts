// Helper to convert 2025-11 → Nov-25
export const formatSheetName = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString('en-US', {
    month: 'short',
    year: '2-digit',
  });
};
