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

export function getDateLabelsBetween(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
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
