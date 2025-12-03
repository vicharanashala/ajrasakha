export function diffWords(oldText: string, newText: string) {
  const oldChars = oldText.split("");
  const newChars = newText.split("");

  const diffs: { value: string; type: "same" | "added" | "removed" }[] = [];

  let i = 0;
  let j = 0;

  const pushGrouped = (value: string, type: "same" | "added" | "removed") => {
    if (!value) return;
    const last = diffs[diffs.length - 1];
    if (last && last.type === type) {
      last.value += value;
    } else {
      diffs.push({ value, type });
    }
  };

  while (i < oldChars.length && j < newChars.length) {
    if (oldChars[i] === newChars[j]) {
      pushGrouped(oldChars[i], "same");
      i++;
      j++;
    } else {
      pushGrouped(oldChars[i], "removed");
      pushGrouped(newChars[j], "added");
      i++;
      j++;
    }
  }

  while (i < oldChars.length) {
    pushGrouped(oldChars[i], "removed");
    i++;
  }

  while (j < newChars.length) {
    pushGrouped(newChars[j], "added");
    j++;
  }

  return diffs;
}



