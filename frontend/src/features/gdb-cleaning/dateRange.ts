// A period picked on the page. Days are the reviewer's own local days, sent to the server as exact times.
export interface IDayRange {
  // yyyy-mm-dd, empty for no limit
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const dayString = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const daysAgo = (n: number) => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return dayString(date);
};

export const PRESETS: { label: string; range: () => IDayRange }[] = [
  { label: "Today", range: () => ({ start: daysAgo(0), end: daysAgo(0) }) },
  { label: "Last 7 days", range: () => ({ start: daysAgo(6), end: daysAgo(0) }) },
  { label: "Last 30 days", range: () => ({ start: daysAgo(29), end: daysAgo(0) }) },
  { label: "All time", range: () => ({ start: "", end: "" }) },
];

// both days become exact times; an incomplete range means all time
export const toQueryRange = ({ start, end }: IDayRange): { from?: string; to?: string } => {
  if (!start || !end) return {};
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return {};
  return { from: from.toISOString(), to: to.toISOString() };
};
