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
  const current = new Date(startDate.getTime());
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate.getTime());
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    // 4. Extract local components to avoid ISO/UTC shifts
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    
    dates.push(`${yyyy}-${mm}-${dd}`);

    // 5. Increment day-by-day
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
