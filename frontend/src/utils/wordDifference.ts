export function diffWords(oldText: string, newText: string) {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  
  const matrix = [];
  
  // Build matrix for LCS
  for (let i = 0; i <= oldWords.length; i++) {
    matrix[i] = [];
    for (let j = 0; j <= newWords.length; j++) {
      if (i === 0 || j === 0) {
        matrix[i][j] = 0;
      } else if (oldWords[i - 1] === newWords[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find differences
  const diffs = [];
  let i = oldWords.length;
  let j = newWords.length;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      diffs.unshift({ value: oldWords[i - 1], type: "same" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      diffs.unshift({ value: newWords[j - 1], type: "added" });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      diffs.unshift({ value: oldWords[i - 1], type: "removed" });
      i--;
    }
  }
  
  // Merge consecutive same-type items
  const mergedDiffs = [];
  for (const diff of diffs) {
    const last = mergedDiffs[mergedDiffs.length - 1];
    if (last && last.type === diff.type) {
      last.value += diff.value;
    } else {
      mergedDiffs.push({ ...diff });
    }
  }
  
  return mergedDiffs;
}