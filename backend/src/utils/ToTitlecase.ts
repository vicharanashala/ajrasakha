export function toTitleCase(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/) // Splits by any amount of whitespace
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}