export function toTitleCase(str: string | undefined | null): string {
  if (!str) return '';
  return (
    str
      .trim()
      .toLowerCase()
      // Collapse runs of whitespace to a single space.
      .replace(/\s+/g, ' ')
      // Capitalise the first letter of every segment — the start of the string
      // or any letter that follows a separator (space, hyphen, dot, slash, etc.).
      // This makes hyphenated names like "medchal-malkajgiri" -> "Medchal-Malkajgiri"
      // and "y.s.r. kadapa" -> "Y.S.R. Kadapa".
      .replace(/(^|[^a-z0-9])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  );
}
