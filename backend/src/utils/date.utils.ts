export function isToday(date?: Date): boolean {
  if (!date) return false;

  const today = new Date();
  const d = new Date(date);

  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}
