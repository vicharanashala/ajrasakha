const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface HighlightedTextProps {
  text: string;
  words: string[];
  className?: string;
}

// the text with every occurrence of the given words marked, ignoring letter case
export const HighlightedText = ({ text, words, className }: HighlightedTextProps) => {
  const unique = Array.from(new Set(words.map((word) => word.trim()).filter(Boolean))).sort(
    (a, b) => b.length - a.length
  );
  if (unique.length === 0) return <>{text}</>;

  // splitting on a pattern with one group puts every match at an odd position
  const parts = text.split(new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className={className}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};
