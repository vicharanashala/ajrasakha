export function getLastNonNAIndex(
  levels: (
    | "NA"
    | {
        time: string;
        yet_to_complete: boolean;
      }
  )[]
) {
  for (let i = levels.length - 1; i >= 0; i--) {
    const v = levels[i];

    // skip NA values
    if (v === "NA" || v == null) continue;

    // object → valid completed level
    return i;
  }

  return null;
}
