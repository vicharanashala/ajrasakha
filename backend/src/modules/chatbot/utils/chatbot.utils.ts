export function getDateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]); 
  }

  return dates;
}

export function mapToSeries(
  labels: string[],
  data: { _id: string; count: number }[],
): number[] {
  const map: Record<string, number> = {};

  data.forEach((item) => {
    map[item._id] = item.count;
  });

  return labels.map((date) => map[date] || 0);
}