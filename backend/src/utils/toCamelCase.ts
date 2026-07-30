export function toCamelCase(str: string | undefined | null): string {
  if (!str) return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  return trimmed
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
